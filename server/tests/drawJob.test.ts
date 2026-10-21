import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db';
import { adminAuditLog, draws, walletLedger } from '../src/db/schema';
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
    const { pkg, draw } = await makeDraw({ price: 50, prizeValue: 1000, min: 5, drawTime: past() });
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

  it('below min_tickets: cancels and refunds everyone exactly once', async () => {
    const { pkg, draw } = await makeDraw({ price: 50, min: 5, drawTime: past() });
    const sold = await sellTickets(draw.id, 50, 3);
    await Promise.all([executeDraw(draw.id), executeDraw(draw.id)]);
    const [d] = await db.select().from(draws).where(eq(draws.id, draw.id));
    expect(d.status).toBe('cancelled');
    expect(d.winnerUserId).toBeNull();
    for (const s of sold) expect(await balanceOf(s.userId)).toBe(1000);
    expect(await db.select().from(walletLedger).where(eq(walletLedger.type, 'refund'))).toHaveLength(3);
    expect(await openCount(pkg.id)).toBe(1);
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
    const { draw } = await makeDraw({ min: 0, mode: 'admin_selected', drawTime: new Date(Date.now() + 3600_000) });
    const sold = await sellTickets(draw.id, 50, 5);
    await selectWinner(admin.id, draw.id, 4);
    await db.update(draws).set({ drawTime: past() }).where(eq(draws.id, draw.id));
    await executeDraw(draw.id);
    const [d] = await db.select().from(draws).where(eq(draws.id, draw.id));
    expect(d.winningTicketNo).toBe(4);
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
    await expect(selectWinner(admin.id, draw.id, 1)).rejects.toMatchObject({ code: 'DRAW_LOCKED' });
  });

  it('admin edits are audited', async () => {
    const admin = await makeUser(0);
    const { draw } = await makeDraw({});
    await setMode(admin.id, draw.id, 'admin_selected', '1.2.3.4');
    await selectWinner(admin.id, draw.id, 9, '1.2.3.4');
    const log = await db.select().from(adminAuditLog);
    expect(log.map((l) => l.action)).toEqual(['set_mode', 'select_winner']);
    expect(log[0].ip).toBe('1.2.3.4');
  });
});
