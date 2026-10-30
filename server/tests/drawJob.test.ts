import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db';
import { adminAuditLog, drawTierPrizes, drawTierWinners, draws, packages, tickets, walletLedger } from '../src/db/schema';
import { prefixMatch } from '../src/lib/tiers';
import { nextDrawFor } from '../src/services/draws';
import { executeDraw, runDueDraws } from '../src/services/drawJob';
import { deletePackage, listPackagesWithTiers, selectWinner, setTierPrizes, updatePackage } from '../src/services/admin';
import { balanceOf, closePool, makeDraw, makeUser, resetDb, sellTickets } from './helpers';

beforeEach(resetDb);
afterAll(closePool);

const past = () => new Date(Date.now() - 60_000);
const openCount = async (packageId: number) =>
  (await db.select().from(draws)).filter((d) => d.packageId === packageId && d.status === 'open').length;
/** Stand-in for the admin choosing the winner before draw time. */
const pick = (drawId: number, ticketNo: number) => db.update(draws).set({ selectedTicketNo: ticketNo }).where(eq(draws.id, drawId));

describe('draw job', () => {
  it('is idempotent: concurrent + repeated runs pay the prize once and open exactly one next draw', async () => {
    const { pkg, draw } = await makeDraw({ price: 50, prizeValue: 1000, drawTime: past() });
    await sellTickets(draw.id, 50, 6);
    await pick(draw.id, 100003);
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
    await pick(draw.id, 100001);
    await executeDraw(draw.id);
    const [d] = await db.select().from(draws).where(eq(draws.id, draw.id));
    expect(d.prizeAmount).toBe(800);
  });

  it('a single sold ticket is enough: that ticket wins, no minimum', async () => {
    const { pkg, draw } = await makeDraw({ price: 50, prizeValue: 1000, drawTime: past() });
    const [only] = await sellTickets(draw.id, 50, 1);
    await pick(draw.id, only.ticketNo);
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

  it('selected ticket wins at draw time', async () => {
    const admin = await makeUser(0);
    const { draw } = await makeDraw({ drawTime: new Date(Date.now() + 3600_000) });
    const sold = await sellTickets(draw.id, 50, 5);
    await selectWinner(admin.id, draw.id, 100004);
    await db.update(draws).set({ drawTime: past() }).where(eq(draws.id, draw.id));
    await executeDraw(draw.id);
    const [d] = await db.select().from(draws).where(eq(draws.id, draw.id));
    expect(d.winningTicketNo).toBe(100004);
    expect(d.winMethod).toBe('admin_selected');
    expect(d.winnerUserId).toBe(sold[3].userId);
  });

  it('no selection by draw time: sales close, next draw opens, result waits for the admin', async () => {
    const admin = await makeUser(0);
    const { pkg, draw } = await makeDraw({ prizeValue: 1000, drawTime: past() });
    const sold = await sellTickets(draw.id, 50, 5);
    expect(await executeDraw(draw.id)).toBe('awaiting_result');
    expect(await executeDraw(draw.id)).toBe('skipped');
    let [d] = await db.select().from(draws).where(eq(draws.id, draw.id));
    expect([d.status, d.winningTicketNo]).toEqual(['drawing', null]);
    expect(await db.select().from(walletLedger).where(eq(walletLedger.type, 'prize'))).toHaveLength(0);
    expect(await openCount(pkg.id)).toBe(1);

    await expect(selectWinner(admin.id, draw.id, 123456)).rejects.toMatchObject({ code: 'TICKET_NOT_SOLD' });
    expect(await selectWinner(admin.id, draw.id, 100002)).toMatchObject({ announced: true });
    [d] = await db.select().from(draws).where(eq(draws.id, draw.id));
    expect([d.status, d.winningTicketNo, d.winMethod, d.winnerUserId]).toEqual(['completed', 100002, 'admin_selected', sold[1].userId]);
    expect(await balanceOf(sold[1].userId)).toBe(950 + 1000);
    await expect(selectWinner(admin.id, draw.id, 100003)).rejects.toMatchObject({ code: 'DRAW_LOCKED' });
  });

  it('only a sold ticket can be selected', async () => {
    const admin = await makeUser(0);
    const { draw } = await makeDraw({});
    await expect(selectWinner(admin.id, draw.id, 100001)).rejects.toMatchObject({ code: 'TICKET_NOT_SOLD' });
    await expect(selectWinner(admin.id, draw.id, 99)).rejects.toMatchObject({ code: 'INVALID_TICKET' });
  });

  it('admin edits are audited', async () => {
    const admin = await makeUser(0);
    const { draw } = await makeDraw({});
    await sellTickets(draw.id, 50, 9);
    await selectWinner(admin.id, draw.id, 100009, '1.2.3.4');
    const log = await db.select().from(adminAuditLog);
    expect(log.map((l) => l.action)).toEqual(['select_winner']);
    expect(log[0].ip).toBe('1.2.3.4');
  });

  it('leading-digit consolation prizes: best prefix match per ticket, admin-set amounts, paid once', async () => {
    const { draw } = await makeDraw({ prizeValue: 1000, drawTime: past() });
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

  it('one user holding jackpot + several tier tickets: every ticket paid, one summed prize row, draw still completes', async () => {
    const { pkg, draw } = await makeDraw({ prizeValue: 1000, drawTime: past() });
    await db.update(draws).set({ selectedTicketNo: 123456 }).where(eq(draws.id, draw.id));
    await db.insert(drawTierPrizes).values([{ drawId: draw.id, matchDigits: 5, prize: 200 }, { drawId: draw.id, matchDigits: 4, prize: 50 }]);
    const u = await makeUser(1000);
    await db.insert(tickets).values([123456, 123450, 123451, 123499].map((ticketNo) => ({ drawId: draw.id, userId: u.id, ticketNo })));

    expect(await executeDraw(draw.id)).toBe('completed');
    expect(await balanceOf(u.id)).toBe(1000 + 1000 + 200 + 200 + 50);
    expect(await db.select().from(walletLedger).where(eq(walletLedger.type, 'prize'))).toHaveLength(1);
    expect((await db.select().from(drawTierWinners)).map((t) => t.matchDigits).sort()).toEqual([4, 5, 5]);
    expect(await openCount(pkg.id)).toBe(1);
  });

  it('package edits apply to the open draw while it has no tickets sold', async () => {
    const admin = await makeUser(0);
    const { pkg, draw } = await makeDraw({ price: 50, prizeValue: 2000, max: 100 });
    const now = new Date('2026-10-24T09:30:00Z'); // 15:00 IST
    await updatePackage(admin.id, pkg.id, { name: 'Renamed', theme: 'blue', price: 25, prizeValue: 20000, maxTickets: 10, drawIntervalMinutes: null, dailyTime: '15:09' }, undefined, now);
    await setTierPrizes(admin.id, pkg.id, [{ matchDigits: 5, prize: 777 }]);
    const [d] = await db.select().from(draws).where(eq(draws.id, draw.id));
    expect([d.status, d.packageName, d.theme, d.ticketPrice, d.prizeValue, d.maxTickets]).toEqual(['open', 'Renamed', 'blue', 25, 20000, 10]);
    expect(d.drawTime.toISOString()).toBe('2026-10-24T09:39:00.000Z');
    expect((await db.select().from(drawTierPrizes).where(eq(drawTierPrizes.drawId, draw.id))).find((t) => t.matchDigits === 5)?.prize).toBe(777);
  });

  it('package is locked while its open draw has tickets sold, and unlocks once the result is out', async () => {
    const admin = await makeUser(0);
    const { pkg, draw } = await makeDraw({ price: 50, prizeValue: 2000, max: 100 });
    await sellTickets(draw.id, 50, 1);
    const tiersBefore = await db.select().from(drawTierPrizes).where(eq(drawTierPrizes.drawId, draw.id));
    await expect(updatePackage(admin.id, pkg.id, { price: 25, name: 'X' })).rejects.toMatchObject({ code: 'PACKAGE_LOCKED' });
    await expect(setTierPrizes(admin.id, pkg.id, [{ matchDigits: 5, prize: 777 }])).rejects.toMatchObject({ code: 'PACKAGE_LOCKED' });
    const [p] = await db.select().from(packages).where(eq(packages.id, pkg.id));
    expect([p.price, p.name]).toEqual([50, 'Test']);
    const [d] = await db.select().from(draws).where(eq(draws.id, draw.id));
    expect([d.ticketPrice, d.prizeValue, d.maxTickets, d.drawTime.getTime()]).toEqual([50, 2000, 100, draw.drawTime.getTime()]);
    expect(await db.select().from(drawTierPrizes).where(eq(drawTierPrizes.drawId, draw.id))).toEqual(tiersBefore);

    await pick(draw.id, 100001);
    await db.update(draws).set({ drawTime: past() }).where(eq(draws.id, draw.id));
    await executeDraw(draw.id); // result announced, next draw opens empty
    await updatePackage(admin.id, pkg.id, { price: 25, name: 'Renamed', theme: 'blue' });
    const all = await db.select().from(draws);
    const open = all.find((x) => x.status === 'open')!, done = all.find((x) => x.id === draw.id)!;
    expect([open.ticketPrice, open.packageName, open.theme]).toEqual([25, 'Renamed', 'blue']);
    // the finished draw (its tickets and result) keeps the name, look and price it was played under
    expect([done.status, done.ticketPrice, done.packageName, done.theme]).toEqual(['completed', 50, 'Test', 'green']);
  });

  it('delete: refused while tickets are sold; otherwise soft-deletes, cancels the empty draw, keeps history', async () => {
    const admin = await makeUser(0);
    const { pkg, draw } = await makeDraw({ drawTime: past() });
    await sellTickets(draw.id, 50, 1);
    await expect(deletePackage(admin.id, pkg.id)).rejects.toMatchObject({ code: 'PACKAGE_LOCKED' });

    await pick(draw.id, 100001);
    await executeDraw(draw.id); // result out, next draw opens empty
    await deletePackage(admin.id, pkg.id);
    const all = await db.select().from(draws).where(eq(draws.packageId, pkg.id));
    expect(all.map((d) => d.status).sort()).toEqual(['cancelled', 'completed']);
    expect(await openCount(pkg.id)).toBe(0);
    expect((await listPackagesWithTiers()).map((p) => p.id)).not.toContain(pkg.id);
    const [p] = await db.select().from(packages).where(eq(packages.id, pkg.id));
    expect([p.isActive, !!p.deletedAt]).toEqual([false, true]);
    await expect(updatePackage(admin.id, pkg.id, { isActive: true })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(deletePackage(admin.id, pkg.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await db.select().from(adminAuditLog)).map((a) => a.action)).toContain('package_delete');
  });

  it('a tier with prize 0 (or missing) pays nothing', async () => {
    const { draw } = await makeDraw({ drawTime: past() });
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
