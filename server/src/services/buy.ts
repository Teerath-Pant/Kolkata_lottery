import { and, eq } from 'drizzle-orm';
import { randomInt } from 'crypto';
import { config } from '../config';
import { Tx, db } from '../db';
import { draws, idempotencyKeys, tickets } from '../db/schema';
import { AppError, notFound } from '../lib/errors';
import { applyWallet, lockWallet } from './wallet';

export interface BuyInput { ticketNo?: number; random?: boolean }

async function insertTicket(tx: Tx, drawId: number, userId: number, ticketNo: number) {
  const [t] = await tx.insert(tickets).values({ drawId, userId, ticketNo })
    .onConflictDoNothing({ target: [tickets.drawId, tickets.ticketNo] }).returning();
  return t;
}

async function assignRandom(tx: Tx, drawId: number, userId: number, max: number) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const rows = await tx.select({ n: tickets.ticketNo }).from(tickets).where(eq(tickets.drawId, drawId));
    const taken = new Set(rows.map((r) => r.n));
    const free: number[] = [];
    for (let n = 1; n <= max; n++) if (!taken.has(n)) free.push(n);
    if (!free.length) throw new AppError(409, 'DRAW_FULL', 'All tickets are sold');
    const t = await insertTicket(tx, drawId, userId, free[randomInt(free.length)]);
    if (t) return t; // else lost a race for that number: retry with fresh view
  }
  throw new AppError(409, 'TICKET_TAKEN', 'Could not assign a number, please retry');
}

/**
 * One transaction. Lock order is always draw (shared) -> wallet (exclusive), the same order the draw job uses
 * (draw exclusive -> wallet), so buyers and the job can never deadlock.
 */
export async function buyTicket(userId: number, drawId: number, input: BuyInput, idemKey?: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const [draw] = await tx.select().from(draws).where(eq(draws.id, drawId)).for('share');
    if (!draw) throw notFound('Draw');
    await lockWallet(tx, userId); // serialises every request of the same user (also makes idempotency race-free)

    if (idemKey) {
      const [prev] = await tx.select().from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, idemKey)));
      if (prev) return prev.response as BuyResult;
    }

    const cutoff = draw.drawTime.getTime() - config.BUY_CUTOFF_SECONDS * 1000;
    if (draw.status !== 'open' || now.getTime() >= cutoff) {
      throw new AppError(400, 'DRAW_CLOSED', 'Ticket sales for this draw are closed');
    }
    const [mine] = await tx.select({ id: tickets.id }).from(tickets)
      .where(and(eq(tickets.drawId, drawId), eq(tickets.userId, userId)));
    if (mine) throw new AppError(409, 'ALREADY_HAS_TICKET', 'You already have a ticket in this draw');

    let ticket;
    if (input.random) {
      ticket = await assignRandom(tx, drawId, userId, draw.maxTickets);
    } else {
      const no = input.ticketNo!;
      if (no < 1 || no > draw.maxTickets) throw new AppError(400, 'INVALID_TICKET', `Ticket must be 1-${draw.maxTickets}`);
      ticket = await insertTicket(tx, drawId, userId, no);
      if (!ticket) throw new AppError(409, 'TICKET_TAKEN', 'That ticket number is already taken');
    }

    const balance = await applyWallet(tx, userId, -draw.ticketPrice, 'ticket_purchase', drawId);
    const result: BuyResult = { ticketId: ticket.id, drawId, ticketNo: ticket.ticketNo, price: draw.ticketPrice, balance };
    if (idemKey) await tx.insert(idempotencyKeys).values({ key: idemKey, userId, response: result });
    return result;
  });
}

export interface BuyResult { ticketId: number; drawId: number; ticketNo: number; price: number; balance: number }
