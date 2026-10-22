import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db';
import { tickets, walletLedger } from '../src/db/schema';
import { buyTicket } from '../src/services/buy';
import { balanceOf, closePool, makeDraw, makeUser, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(closePool);

const code = (r: PromiseSettledResult<unknown>) => (r.status === 'rejected' ? (r.reason as any).code : 'OK');

describe('buy ticket transaction', () => {
  it('race: 20 users grab the same number, exactly one wins and only they pay', async () => {
    const { draw } = await makeDraw({ price: 50 });
    const users = await Promise.all(Array.from({ length: 20 }, () => makeUser(1000)));
    const results = await Promise.allSettled(users.map((u) => buyTicket(u.id, draw.id, { ticketNo: 123456 })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => code(r) === 'TICKET_TAKEN')).toHaveLength(19);
    const balances = await Promise.all(users.map((u) => balanceOf(u.id)));
    expect(balances.filter((b) => b === 950)).toHaveLength(1);
    expect(balances.filter((b) => b === 1000)).toHaveLength(19);
    expect(await db.select().from(tickets).where(eq(tickets.drawId, draw.id))).toHaveLength(1);
    expect(await db.select().from(walletLedger)).toHaveLength(1);
  });

  it('race: one user firing 10 parallel buys gets one ticket and is charged once', async () => {
    const { draw } = await makeDraw({ price: 50 });
    const u = await makeUser(1000);
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => buyTicket(u.id, draw.id, { random: true })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => code(r) === 'ALREADY_HAS_TICKET')).toHaveLength(9);
    expect(await balanceOf(u.id)).toBe(950);
  });

  it('race: 30 random buyers all get unique numbers', async () => {
    const { draw } = await makeDraw({ price: 10, max: 30 });
    const users = await Promise.all(Array.from({ length: 30 }, () => makeUser(100)));
    const results = await Promise.all(users.map((u) => buyTicket(u.id, draw.id, { random: true })));
    expect(new Set(results.map((r) => r.ticketNo)).size).toBe(30);
    await expect(buyTicket((await makeUser(100)).id, draw.id, { random: true })).rejects.toMatchObject({ code: 'DRAW_FULL' });
  });

  it('insufficient coins -> 402 and nothing is written', async () => {
    const { draw } = await makeDraw({ price: 50 });
    const u = await makeUser(49);
    await expect(buyTicket(u.id, draw.id, { ticketNo: 100001 })).rejects.toMatchObject({ status: 402 });
    expect(await balanceOf(u.id)).toBe(49);
    expect(await db.select().from(tickets)).toHaveLength(0);
  });

  it('closed draw (inside cutoff) -> 400', async () => {
    const { draw } = await makeDraw({ drawTime: new Date(Date.now() + 10_000) });
    const u = await makeUser(1000);
    await expect(buyTicket(u.id, draw.id, { ticketNo: 100001 })).rejects.toMatchObject({ status: 400, code: 'DRAW_CLOSED' });
  });

  it('idempotency key replays the first response without charging twice', async () => {
    const { draw } = await makeDraw({ price: 50 });
    const u = await makeUser(1000);
    const a = await buyTicket(u.id, draw.id, { random: true }, 'key-12345678');
    const b = await buyTicket(u.id, draw.id, { random: true }, 'key-12345678');
    expect(b).toEqual(a);
    expect(await balanceOf(u.id)).toBe(950);
  });

  it('non 6-digit number -> 400', async () => {
    const { draw } = await makeDraw({ max: 10 });
    const u = await makeUser(1000);
    await expect(buyTicket(u.id, draw.id, { ticketNo: 99999 })).rejects.toMatchObject({ status: 400 });
  });
});
