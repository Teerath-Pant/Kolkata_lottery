import { and, asc, eq, lte } from 'drizzle-orm';
import { db } from '../db';
import { adminAuditLog, draws, packages, tickets } from '../db/schema';
import { pickWinner } from '../lib/fair';
import { computePrize, nextDrawTime, openDraw } from './draws';
import { applyWallet } from './wallet';

export type DrawOutcome = 'skipped' | 'completed' | 'cancelled_no_tickets' | 'cancelled_refunded';

/**
 * Executes one due draw in a single transaction. Idempotent: the conditional UPDATE open->drawing
 * only matches once, so a concurrent or repeated run gets zero rows and returns 'skipped'.
 */
export async function executeDraw(drawId: number, now = new Date()): Promise<DrawOutcome> {
  return db.transaction(async (tx) => {
    const [d] = await tx.update(draws).set({ status: 'drawing' })
      .where(and(eq(draws.id, drawId), eq(draws.status, 'open'), lte(draws.drawTime, now))).returning();
    if (!d) return 'skipped';

    const sold = await tx.select().from(tickets).where(eq(tickets.drawId, d.id)).orderBy(asc(tickets.ticketNo));
    const [pkg] = await tx.select().from(packages).where(eq(packages.id, d.packageId));
    const reveal = { serverSeed: d.serverSeed, completedAt: now };
    let outcome: DrawOutcome;

    if (sold.length === 0) {
      await tx.update(draws).set({ status: 'cancelled', ...reveal }).where(eq(draws.id, d.id));
      outcome = 'cancelled_no_tickets';
    } else if (sold.length < d.minTickets) {
      for (const t of sold) await applyWallet(tx, t.userId, d.ticketPrice, 'refund', d.id);
      await tx.update(draws).set({ status: 'cancelled', ...reveal }).where(eq(draws.id, d.id));
      await tx.insert(adminAuditLog).values({
        adminId: null, action: 'draw_cancelled_refunded', drawId: d.id,
        payload: { sold: sold.length, minTickets: d.minTickets, refunded: sold.length * d.ticketPrice },
      });
      outcome = 'cancelled_refunded';
    } else {
      const soldNos = sold.map((t) => t.ticketNo);
      let winningNo: number;
      let method: 'random' | 'admin_selected' | 'fallback_random';
      if (d.mode === 'admin_selected' && d.selectedTicketNo && soldNos.includes(d.selectedTicketNo)) {
        winningNo = d.selectedTicketNo;
        method = 'admin_selected';
      } else {
        winningNo = pickWinner(d.serverSeed!, d.id, soldNos).ticketNo;
        method = d.mode === 'admin_selected' ? 'fallback_random' : 'random';
        if (method === 'fallback_random') {
          await tx.insert(adminAuditLog).values({
            adminId: null, action: 'draw_fallback_random', drawId: d.id,
            payload: { selectedTicketNo: d.selectedTicketNo, reason: d.selectedTicketNo ? 'selected ticket was not sold' : 'no ticket selected' },
          });
        }
      }
      const winner = sold.find((t) => t.ticketNo === winningNo)!;
      const prize = computePrize(d, sold.length);
      if (prize > 0) await applyWallet(tx, winner.userId, prize, 'prize', d.id);
      await tx.update(draws).set({
        status: 'completed', winningTicketNo: winningNo, winnerUserId: winner.userId,
        prizeAmount: prize, winMethod: method, ...reveal,
      }).where(eq(draws.id, d.id));
      outcome = 'completed';
    }

    if (pkg.isActive) await openDraw(tx, pkg, nextDrawTime(d.drawTime, pkg.drawIntervalMinutes, now));
    return outcome;
  });
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
