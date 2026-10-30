import { and, asc, eq, lte } from 'drizzle-orm';
import { Tx, db } from '../db';
import { drawTierPrizes, drawTierWinners, draws, packages, tickets } from '../db/schema';
import { prefixMatch } from '../lib/tiers';
import { computePrize, invalidatePublicCache, nextDrawFor, openDraw } from './draws';
import { applyWallet } from './wallet';

export type DrawOutcome = 'skipped' | 'completed' | 'cancelled_no_tickets' | 'awaiting_result';
type Draw = typeof draws.$inferSelect;
type Ticket = typeof tickets.$inferSelect;

/**
 * Executes one due draw in a single transaction. Idempotent: the conditional UPDATE open->drawing
 * only matches once, so a concurrent or repeated run gets zero rows and returns 'skipped'.
 * The admin always picks the winner: a sold ticket selected before draw time wins straight away;
 * otherwise the draw stays 'drawing' (sales closed) until the admin enters a sold ticket number.
 */
export async function executeDraw(drawId: number, now = new Date()): Promise<DrawOutcome> {
  const outcome = await executeDrawTx(drawId, now);
  if (outcome !== 'skipped') invalidatePublicCache();
  return outcome;
}

async function executeDrawTx(drawId: number, now: Date): Promise<DrawOutcome> {
  return db.transaction(async (tx) => {
    const [d] = await tx.update(draws).set({ status: 'drawing' })
      .where(and(eq(draws.id, drawId), eq(draws.status, 'open'), lte(draws.drawTime, now))).returning();
    if (!d) return 'skipped';

    const sold = await tx.select().from(tickets).where(eq(tickets.drawId, d.id)).orderBy(asc(tickets.ticketNo));
    const [pkg] = await tx.select().from(packages).where(eq(packages.id, d.packageId));
    let outcome: DrawOutcome;

    if (sold.length === 0) {
      await tx.update(draws).set({ status: 'cancelled', completedAt: now }).where(eq(draws.id, d.id));
      outcome = 'cancelled_no_tickets';
    } else if (d.selectedTicketNo && sold.some((t) => t.ticketNo === d.selectedTicketNo)) {
      await settleDraw(tx, d, sold, d.selectedTicketNo, now);
      outcome = 'completed';
    } else {
      outcome = 'awaiting_result';
    }

    if (pkg.isActive) {
      // a run-once package had its one draw: switch it off (the admin can set a new time and activate it again)
      if (pkg.runOnceAt) await tx.update(packages).set({ isActive: false }).where(eq(packages.id, pkg.id));
      else await openDraw(tx, pkg, nextDrawFor(pkg, d.drawTime, now));
    }
    return outcome;
  });
}

/** Pay the jackpot to `winningNo` (a sold ticket) plus every digit-match prize, and mark the draw completed. */
export async function settleDraw(tx: Tx, d: Draw, sold: Ticket[], winningNo: number, now: Date) {
  const winner = sold.find((t) => t.ticketNo === winningNo)!;
  const prize = computePrize(d, sold.length);
  // one 'prize' ledger row per user per draw (ledger_pay_once_idx): jackpot + every tier-winning ticket summed
  const payout = new Map<number, number>();
  const credit = (userId: number, amount: number) => payout.set(userId, (payout.get(userId) ?? 0) + amount);
  if (prize > 0) credit(winner.userId, prize);

  // consolation prizes: each ticket's leading-digit match with the winning number (admin-set amounts)
  const tierPrize = new Map(
    (await tx.select().from(drawTierPrizes).where(eq(drawTierPrizes.drawId, d.id))).map((r) => [r.matchDigits, r.prize]),
  );
  for (const t of sold) {
    if (t.ticketNo === winningNo) continue;
    const k = prefixMatch(winningNo, t.ticketNo);
    const amount = tierPrize.get(k) ?? 0;
    if (k < 1 || amount <= 0) continue;
    credit(t.userId, amount);
    await tx.insert(drawTierWinners).values({ drawId: d.id, userId: t.userId, ticketNo: t.ticketNo, matchDigits: k, prize: amount });
  }
  for (const [userId, amount] of payout) await applyWallet(tx, userId, amount, 'prize', d.id);
  await tx.update(draws).set({
    status: 'completed', winningTicketNo: winningNo, winnerUserId: winner.userId,
    prizeAmount: prize, winMethod: 'admin_selected', completedAt: now,
  }).where(eq(draws.id, d.id));
}

export async function runDueDraws(now = new Date()) {
  const due = await db.select({ id: draws.id }).from(draws)
    .where(and(eq(draws.status, 'open'), lte(draws.drawTime, now))).orderBy(asc(draws.drawTime));
  const results: { drawId: number; outcome: DrawOutcome | 'error' }[] = [];
  for (const { id } of due) {
    try {
      results.push({ drawId: id, outcome: await executeDraw(id, now) });
    } catch (e) {
      console.error(`[draw-job] draw ${id} failed, will retry next tick`, e);
      results.push({ drawId: id, outcome: 'error' });
    }
  }
  return results;
}
