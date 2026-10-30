import { and, eq, lt, sql } from 'drizzle-orm';
import { createHash, randomInt } from 'crypto';
import { Tx, db } from '../db';
import { draws, idempotencyKeys, packages, tickets } from '../db/schema';
import { AppError, notFound } from '../lib/errors';
import { TICKET_MAX, TICKET_MIN, salesWindow, salesWindowHint } from './draws';
import { notify } from './notifications';
import { getBulkPlan } from './settings';
import { applyWallet, lockWallet } from './wallet';

export interface BuyInput { ticketNo?: number; random?: boolean; purchaseGroup?: string }

/** Idempotency keys are only honoured for a day; a key is bound to one draw + one choice. */
const IDEMPOTENCY_TTL_MS = 24 * 3_600_000;
const requestHash = (drawId: number, input: BuyInput) =>
  createHash('sha256').update(`${drawId}:${input.random ? 'random' : input.ticketNo}`).digest('hex');

export const purgeExpiredIdempotencyKeys = (now = new Date()) =>
  db.delete(idempotencyKeys).where(lt(idempotencyKeys.createdAt, new Date(now.getTime() - IDEMPOTENCY_TTL_MS)));

async function insertTicket(tx: Tx, drawId: number, userId: number, ticketNo: number, purchaseGroup?: string) {
  const [t] = await tx.insert(tickets).values({ drawId, userId, ticketNo, purchaseGroup: purchaseGroup ?? null })
    .onConflictDoNothing({ target: [tickets.drawId, tickets.ticketNo] }).returning();
  return t;
}

async function assignRandom(tx: Tx, drawId: number, userId: number, purchaseGroup?: string) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const t = await insertTicket(tx, drawId, userId, randomInt(TICKET_MIN, TICKET_MAX + 1), purchaseGroup);
    if (t) return t; // number already sold: roll again
  }
  throw new AppError(409, 'TICKET_TAKEN', 'Could not assign a number, please retry');
}

/**
 * One transaction. Lock order is always draw -> wallet, the same order the draw job uses,
 * so buyers and the job can never deadlock.
 */
export async function buyTicket(userId: number, drawId: number, input: BuyInput, idemKey?: string, now = new Date()) {
  return db.transaction(async (tx) => {
    // exclusive draw lock serialises buys per draw so the max_tickets count check below is exact
    const [draw] = await tx.select().from(draws).where(eq(draws.id, drawId)).for('update');
    if (!draw) throw notFound('Draw');
    await lockWallet(tx, userId); // serialises every request of the same user (also makes idempotency race-free)

    const reqHash = requestHash(drawId, input);
    if (idemKey) {
      const [prev] = await tx.select().from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, idemKey)));
      if (prev && now.getTime() - prev.createdAt.getTime() > IDEMPOTENCY_TTL_MS) {
        await tx.delete(idempotencyKeys).where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, idemKey)));
      } else if (prev) {
        // same key for a different draw / number would silently return an unrelated purchase: refuse instead
        if (prev.requestHash && prev.requestHash !== reqHash) {
          throw new AppError(422, 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different request');
        }
        return prev.response as BuyResult;
      }
    }

    const [pkg] = await tx.select({ buyStartTime: packages.buyStartTime, buyEndTime: packages.buyEndTime, buyStartAt: packages.buyStartAt, buyEndAt: packages.buyEndAt }).from(packages).where(eq(packages.id, draw.packageId));
    const sales = salesWindow(draw, pkg, now);
    const hours = sales.restricted ? salesWindowHint(pkg) : '';
    if (draw.status !== 'open' || now.getTime() >= sales.end.getTime() || (sales.restricted && sales.start.getTime() >= sales.end.getTime())) {
      throw new AppError(400, 'DRAW_CLOSED', `Ticket sales for this draw are closed${hours}`);
    }
    // the default start is the moment the draw opened, so only the package's buy window can lie in the future
    if (sales.restricted && now.getTime() < sales.start.getTime()) {
      throw new AppError(400, 'SALES_NOT_STARTED', `Ticket sales for this draw have not started yet${hours}`);
    }
    const [{ sold }] = await tx.select({ sold: sql<number>`count(*)::int` }).from(tickets).where(eq(tickets.drawId, drawId));
    if (sold >= draw.maxTickets) throw new AppError(409, 'DRAW_FULL', 'All tickets are sold');

    let ticket;
    if (input.random) {
      ticket = await assignRandom(tx, drawId, userId, input.purchaseGroup);
    } else {
      const no = input.ticketNo!;
      if (no < TICKET_MIN || no > TICKET_MAX) throw new AppError(400, 'INVALID_TICKET', 'Ticket must be a 6-digit number');
      ticket = await insertTicket(tx, drawId, userId, no, input.purchaseGroup);
      if (!ticket) throw new AppError(409, 'TICKET_TAKEN', 'That ticket number is already taken');
    }

    let balance = await applyWallet(tx, userId, -draw.ticketPrice, 'ticket_purchase', drawId);

    // the ticket that completes a purchase of plan.tickets pays the bonus (== not >=, so it fires once per purchase); admin sets the plan
    let bonus = 0;
    const plan = input.purchaseGroup ? await getBulkPlan(tx) : null;
    if (input.purchaseGroup && plan?.enabled) {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(tickets).where(and(
        eq(tickets.drawId, drawId), eq(tickets.userId, userId), eq(tickets.purchaseGroup, input.purchaseGroup)));
      if (n === plan.tickets) {
        bonus = plan.bonus;
        balance = await applyWallet(tx, userId, bonus, 'bulk_bonus', drawId);
        await notify(tx, userId, {
          type: 'bulk_bonus', title: 'Bonus added',
          body: `₹${bonus} bonus added to your bonus wallet for booking ${plan.tickets} tickets in ${draw.packageName}.`,
        });
      }
    }
    const result: BuyResult = { ticketId: ticket.id, drawId, ticketNo: ticket.ticketNo, price: draw.ticketPrice, bonus, balance };
    if (idemKey) await tx.insert(idempotencyKeys).values({ key: idemKey, userId, requestHash: reqHash, response: result });
    return result;
  });
}

export interface BuyResult { ticketId: number; drawId: number; ticketNo: number; price: number; bonus: number; balance: number }
