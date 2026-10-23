import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db';
import { adminAuditLog, drawTierPrizes, drawTierWinners, draws, packages, tickets, walletLedger } from '../src/db/schema';
import { prefixMatch } from '../src/lib/tiers';
import { nextDrawFor } from '../src/services/draws';
import { executeDraw, runDueDraws } from '../src/services/drawJob';
import { selectWinner, setMode } from '../src/services/admin';
import { balanceOf, closePool, makeDraw, makeUser, resetDb, sellTickets } from './helpers';

beforeEach(resetDb);
afterAll(closePool);

const past = () => new Date(Date.now() - 60_000);
const openCount = async (packageId: number) =>
  (await db.select().from(draws)).filter((d) => d.packageId === packageId && d.status === 'open').length;

describe('draw job', () => {
  it('is idempotent: concurrent + repeated runs pay the prize once and open exactly one next draw', async () => {
    const { pkg, draw } = await makeDraw({ price: 50, prizeValue: 1000, drawTime: past() });
    await sellTickets(draw.id, 50, 6);
    const outcomes = await Promise.all([executeDraw(draw.id), executeDraw(draw.id), executeDraw(draw.id)]);
    expect(outcomes.filter((o) => o === 'completed')).toHaveLength(1);
    expect(outcomes.filter((o) => o === 'skipped')).toHaveLength(2);
    await runDueDraws(); // a later cron tick finds nothing due for the old draw
    await runDueDraws();

    const [d] = await db.select().from(draws).where(eq(draws.id, draw.id));
    expect(d.status).toBe('completed');
    expect(d.serverSeed).toBeTruthy();
    expect(await db.select().from(walletLedger).where(eq(walletLedger.type, 'prize'))).toHaveLength(1);
    expect(await balanceOf(d.winnerUserId!)).toBe(950 + 1000);
    expect(await openCount(pkg.id)).toBe(1);
    const [next] = (await db.select().from(draws)).filter((x) => x.status === 'open');
    expect(next.drawTime.getTime()).toBeGreaterThan(Date.now());
    expect(next.serverSeedHash).not.toBe(d.serverSeedHash);
  });

  it('pool_percent prize = percent of pool', async () => {
    const { draw } = await makeDraw({ price: 100, prizeType: 'pool_percent', prizeValue: 80, drawTime: past() });
    await sellTickets(draw.id, 100, 10);
    await executeDraw(draw.id);
    const [d] = await db.select().from(draws).where(eq(draws.id, draw.id));
    expect(d.prizeAmount).toBe(800);
  });

  it('a single sold ticket is enough: that ticket wins, no minimum', async () => {
    const { pkg, draw } = await makeDraw({ price: 50, prizeValue: 1000, drawTime: past() });
    const [only] = await sellTickets(draw.id, 50, 1);
    expect(await executeDraw(draw.id)).toBe('completed');
    const [d] = await db.select().from(draws).where(eq(draws.id, draw.id));
    expect(d.status).toBe('completed');
    expect(d.winnerUserId).toBe(only.userId);
    expect(await balanceOf(only.userId)).toBe(950 + 1000);
    expect(await db.select().from(walletLedger).where(eq(walletLedger.type, 'refund'))).toHaveLength(0);
    expect(await openCount(pkg.id)).toBe(1);
  });

  it('daily fixed time (IST): next draw is the next HH:MM IST after now', async () => {
    const daily = { drawIntervalMinutes: null, dailyTime: '18:00' }; // 18:00 IST = 12:30 UTC
    expect(nextDrawFor(daily, new Date(), new Date('2026-10-22T05:06:00Z')).toISOString()).toBe('2026-10-22T12:30:00.000Z');
    expect(nextDrawFor(daily, new Date(), new Date('2026-10-22T12:30:00Z')).toISOString()).toBe('2026-10-23T12:30:00.000Z'); // exactly on time -> tomorrow
    expect(nextDrawFor(daily, new Date(), new Date('2026-10-22T20:00:00Z')).toISOString()).toBe('2026-10-23T12:30:00.000Z'); // 01:30 IST next day
    expect(nextDrawFor({ drawIntervalMinutes: 30, dailyTime: null }, new Date('2026-10-22T10:00:00Z'), new Date('2026-10-22T10:10:00Z')).toISOString()).toBe('2026-10-22T10:30:00.000Z');

    const { pkg, draw } = await makeDraw({ drawTime: past() });
    await db.update(packages).set({ drawIntervalMinutes: null, dailyTime: '18:00' }).where(eq(packages.id, pkg.id));
    await executeDraw(draw.id);
    const [next] = (await db.select().from(draws)).filter((x) => x.status === 'open');
    expect(next.drawTime.getTime()).toBeGreaterThan(Date.now());
    expect(new Date(next.drawTime.getTime() + 330 * 60_000).toISOString().slice(11, 16)).toBe('18:00');
  });

  it('no tickets: skipped (cancelled) and next draw opens', async () => {
    const { pkg, draw } = await makeDraw({ drawTime: past() });
    expect(await executeDraw(draw.id)).toBe('cancelled_no_tickets');
    expect(await openCount(pkg.id)).toBe(1);
  });

  it('does not run before draw_time', async () => {
    const { draw } = await makeDraw({ drawTime: new Date(Date.now() + 3600_000) });
    expect(await executeDraw(draw.id)).toBe('skipped');
  });

  it('admin_selected: selected ticket wins', async () => {
    const admin = await makeUser(0);
    const { draw } = await makeDraw({ mode: 'admin_selected', drawTime: new Date(Date.now() + 3600_000) });
    const sold = await sellTickets(draw.id, 50, 5);
    await selectWinner(admin.id, draw.id, 100004);
    await db.update(draws).set({ drawTime: past() }).where(eq(draws.id, draw.id));
    await executeDraw(draw.id);
    const [d] = await db.select().from(draws).where(eq(draws.id, draw.id));
    expect(d.winningTicketNo).toBe(100004);
    expect(d.winMethod).toBe('admin_selected');
    expect(d.winnerUserId).toBe(sold[3].userId);
  });

  it('admin_selected with no selection falls back to random and audits it', async () => {
    const { draw } = await makeDraw({ mode: 'admin_selected', drawTime: past() });
    await sellTickets(draw.id, 50, 5);
    await executeDraw(draw.id);
    const [d] = await db.select().from(draws).where(eq(draws.id, draw.id));
    expect(d.winMethod).toBe('fallback_random');
    expect((await db.select().from(adminAuditLog)).map((a) => a.action)).toContain('draw_fallback_random');
  });

  it('admin cannot edit mode/winner once draw_time has passed or draw is closed', async () => {
    const admin = await makeUser(0);
    const { draw } = await makeDraw({ drawTime: past() });
    await expect(setMode(admin.id, draw.id, 'admin_selected')).rejects.toMatchObject({ code: 'DRAW_LOCKED' });
    await expect(selectWinner(admin.id, draw.id, 100001)).rejects.toMatchObject({ code: 'DRAW_LOCKED' });
  });

  it('admin edits are audited', async () => {
    const admin = await makeUser(0);
    const { draw } = await makeDraw({});
    await setMode(admin.id, draw.id, 'admin_selected', '1.2.3.4');
    await selectWinner(admin.id, draw.id, 100009, '1.2.3.4');
    const log = await db.select().from(adminAuditLog);
    expect(log.map((l) => l.action)).toEqual(['set_mode', 'select_winner']);
    expect(log[0].ip).toBe('1.2.3.4');
  });

  it('leading-digit consolation prizes: best prefix match per ticket, admin-set amounts, paid once', async () => {
    const { draw } = await makeDraw({ mode: 'admin_selected', prizeValue: 1000, drawTime: past() });
    await db.update(draws).set({ selectedTicketNo: 123456 }).where(eq(draws.id, draw.id));
    await db.insert(drawTierPrizes).values([
      { drawId: draw.id, matchDigits: 1, prize: 5 }, { drawId: draw.id, matchDigits: 2, prize: 25 },
      { drawId: draw.id, matchDigits: 3, prize: 100 }, { drawId: draw.id, matchDigits: 4, prize: 500 },
      { drawId: draw.id, matchDigits: 5, prize: 2000 },
    ]);
    const nos = { win: 123456, k5: 123450, k4: 123499, k2: 129999, k1: 199999, none: 923456 };
    const who: Record<string, { id: number }> = {};
    for (const [name, ticketNo] of Object.entries(nos)) {
      who[name] = await makeUser(1000);
      await db.insert(tickets).values({ drawId: draw.id, userId: who[name].id, ticketNo });
    }

    await Promise.all([executeDraw(draw.id), executeDraw(draw.id)]);
    await executeDraw(draw.id);

    expect(await balanceOf(who.win.id)).toBe(1000 + 1000);
    expect(await balanceOf(who.k5.id)).toBe(1000 + 2000);
    expect(await balanceOf(who.k4.id)).toBe(1000 + 500);
    expect(await balanceOf(who.k2.id)).toBe(1000 + 25);
    expect(await balanceOf(who.k1.id)).toBe(1000 + 5);
    expect(await balanceOf(who.none.id)).toBe(1000);
    expect(await db.select().from(walletLedger).where(eq(walletLedger.type, 'prize'))).toHaveLength(5);
    const tw = await db.select().from(drawTierWinners).where(eq(drawTierWinners.drawId, draw.id));
    expect(tw.map((t) => [t.ticketNo, t.matchDigits, t.prize]).sort()).toEqual([
      [123450, 5, 2000], [123499, 4, 500], [129999, 2, 25], [199999, 1, 5],
    ].sort());
  });

  it('a tier with prize 0 (or missing) pays nothing', async () => {
    const { draw } = await makeDraw({ mode: 'admin_selected', drawTime: past() });
    await db.update(draws).set({ selectedTicketNo: 123456 }).where(eq(draws.id, draw.id));
    await db.insert(drawTierPrizes).values({ drawId: draw.id, matchDigits: 1, prize: 0 });
    const u = await makeUser(1000);
    await db.insert(tickets).values({ drawId: draw.id, userId: u.id, ticketNo: 199999 });
    const w = await makeUser(1000);
    await db.insert(tickets).values({ drawId: draw.id, userId: w.id, ticketNo: 123456 });
    await executeDraw(draw.id);
    expect(await balanceOf(u.id)).toBe(1000);
    expect(await db.select().from(drawTierWinners)).toHaveLength(0);
  });

  it('prefixMatch counts unbroken leading digits only', () => {
    expect(prefixMatch(123456, 123456)).toBe(6);
    expect(prefixMatch(123456, 123450)).toBe(5);
    expect(prefixMatch(123456, 193456)).toBe(1); // later digits match but the run is broken
    expect(prefixMatch(123456, 923456)).toBe(0);
  });
});
