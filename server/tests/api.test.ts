import { AddressInfo } from 'net';
import type { Server } from 'http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { seed } from '../src/db/seed';
import { runDueDraws } from '../src/services/drawJob';
import { db } from '../src/db';
import { draws, users } from '../src/db/schema';
import { closePool, resetDb } from './helpers';

let server: Server;
let base = '';
beforeAll(() => new Promise<void>((r) => { server = createApp().listen(0, () => { base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`; r(); }); }));
afterAll(async () => { server.close(); await closePool(); });
beforeEach(async () => { await resetDb(); await seed(); });

async function call(path: string, o: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {}) {
  const res = await fetch(base + path, {
    method: o.method ?? (o.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}), ...o.headers },
    body: o.body ? JSON.stringify(o.body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) as any };
}
const register = async (mobile = '9876543210') =>
  (await call('/auth/register', { body: { mobile, name: 'Asha', password: 'secret1' } })).body;

describe('http api', () => {
  it('auth: register, duplicate, login, refresh, /me', async () => {
    const r = await register();
    expect(r.accessToken).toBeTruthy();
    expect((await call('/auth/register', { body: { mobile: '9876543210', name: 'Xy', password: 'secret1' } })).status).toBe(409);
    expect((await call('/auth/login', { body: { mobile: '9876543210', password: 'bad-pass' } })).status).toBe(401);
    expect((await call('/auth/login', { body: { mobile: 'abc', password: 'x' } })).status).toBe(400); // zod
    const login = await call('/auth/login', { body: { mobile: '9876543210', password: 'secret1' } });
    expect(login.status).toBe(200);
    const ref = await call('/auth/refresh', { body: { refreshToken: login.body.refreshToken } });
    expect(ref.status).toBe(200);
    expect((await call('/auth/refresh', { body: { refreshToken: login.body.accessToken } })).status).toBe(401); // wrong token type
    expect((await call('/me', { token: ref.body.accessToken })).body.user.mobile).toBe('9876543210');
    expect((await call('/me')).status).toBe(401);
  });

  it('passwords are stored salted + hashed (never plaintext, same password -> different hash)', async () => {
    await register('9111111111');
    await register('9222222222');
    const rows = (await db.select().from(users)).filter((u) => u.role === 'user');
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.passwordHash).not.toContain('secret1');
      expect(r.passwordHash).toMatch(/^\$2[aby]\$12\$/); // bcrypt, cost 12, salt embedded
    }
    expect(rows[0].passwordHash).not.toBe(rows[1].passwordHash);
  });

  it('packages come from DB (50/100/200) and expose mode + seed hash but never the seed', async () => {
    const { body } = await call('/packages');
    expect(body.packages.map((p: any) => [p.price, p.theme])).toEqual([[50, 'green'], [100, 'red'], [200, 'blue']]);
    const d = body.packages[0].currentDraw;
    expect(d.mode).toBe('random');
    expect(d.serverSeedHash).toMatch(/^[0-9a-f]{64}$/);
    expect(d.serverSeed).toBeNull();
    expect((await call(`/draws/${d.id}/verify`)).status).toBe(409);
  });

  it('buy flow: pick, duplicate, taken, random, wallet + ledger, daily claim once', async () => {
    const a = await register('9000000001');
    const b = await register('9000000002');
    const draw = (await call('/packages')).body.packages[0].currentDraw;
    expect(a.user && (await call('/me/wallet', { token: a.accessToken })).body.balance).toBe(500);

    expect((await call(`/draws/${draw.id}/buy`, { token: a.accessToken, body: { ticketNo: 100005, random: true } })).status).toBe(400);
    const ok = await call(`/draws/${draw.id}/buy`, { token: a.accessToken, body: { ticketNo: 100005 } });
    expect(ok.status).toBe(201);
    expect(ok.body.balance).toBe(450);
    expect((await call(`/draws/${draw.id}/buy`, { token: a.accessToken, body: { random: true } })).body.error.code).toBe('ALREADY_HAS_TICKET');
    expect((await call(`/draws/${draw.id}/buy`, { token: b.accessToken, body: { ticketNo: 100005 } })).body.error.code).toBe('TICKET_TAKEN');
    const rnd = await call(`/draws/${draw.id}/buy`, { token: b.accessToken, body: { random: true }, headers: { 'Idempotency-Key': 'abcdefgh-1' } });
    const again = await call(`/draws/${draw.id}/buy`, { token: b.accessToken, body: { random: true }, headers: { 'Idempotency-Key': 'abcdefgh-1' } });
    expect(again.body).toEqual(rnd.body);

    const t1 = (await call(`/draws/${draw.id}/tickets`)).body;
    expect(t1.taken).toContain(100005);
    expect(t1.offers).toHaveLength(10);
    expect(t1.offers.every((n: number) => n >= 100000 && n <= 999999 && !t1.taken.includes(n))).toBe(true);
    const c = await register('9000000005');
    await call(`/draws/${draw.id}/buy`, { token: c.accessToken, body: { ticketNo: t1.offers[3] } });
    const t2 = (await call(`/draws/${draw.id}/tickets`)).body.offers;
    expect(t2.filter((n: number, i: number) => n !== t1.offers[i])).toEqual([t2[3]]); // only the sold slot got a new number
    const mine = (await call('/me/tickets', { token: a.accessToken })).body.tickets;
    expect(mine).toHaveLength(1);
    const w = (await call('/me/wallet', { token: a.accessToken })).body;
    expect(w.balance).toBe(450);
    expect(w.recent.map((r: any) => r.type)).toEqual(['ticket_purchase', 'signup_bonus']);
    expect((await call('/me/daily-claim', { token: a.accessToken, method: 'POST' })).status).toBe(200);
    expect((await call('/me/daily-claim', { token: a.accessToken, method: 'POST' })).status).toBe(429);
    expect((await call(`/draws/${draw.id}`, { token: a.accessToken })).body.myTicketNo).toBe(100005);
  });

  it('admin: role guard, mode/select/adjust, audit log; public sees the mode', async () => {
    const user = await register('9000000003');
    expect((await call('/admin/users', { token: user.accessToken })).status).toBe(403);
    const admin = (await call('/auth/login', { body: { mobile: '9999999999', password: 'Admin@12345' } })).body;
    expect(admin.user.role).toBe('admin');
    const draw = (await call('/packages')).body.packages[0].currentDraw;
    expect((await call(`/admin/draws/${draw.id}/mode`, { token: admin.accessToken, body: { mode: 'admin_selected' } })).status).toBe(200);
    expect((await call(`/admin/draws/${draw.id}/select-winner`, { token: admin.accessToken, body: { ticketNo: 100003 } })).status).toBe(200);
    expect((await call(`/draws/${draw.id}`)).body.mode).toBe('admin_selected');
    expect(JSON.stringify((await call(`/draws/${draw.id}`)).body)).not.toContain('selectedTicketNo');
    const adj = await call(`/admin/users/${user.user.id}/adjust-coins`, { token: admin.accessToken, body: { amount: 25, reason: 'support gift' } });
    expect(adj.body.balance).toBe(525);
    const log = (await call('/admin/audit-log', { token: admin.accessToken })).body.log;
    expect(log.map((l: any) => l.action).sort()).toEqual(['adjust_coins', 'select_winner', 'set_mode']);
    expect((await call('/admin/packages', { token: admin.accessToken, body: { name: 'Mega', price: 500, prizeType: 'fixed', prizeValue: 9000, maxTickets: 50, theme: 'blue', drawIntervalMinutes: 20 } })).status).toBe(201);
  });

  it('results + verify after a draw completes', async () => {
    const u = await register('9000000004');
    const draw = (await call('/packages')).body.packages[0].currentDraw;
    await call(`/draws/${draw.id}/buy`, { token: u.accessToken, body: { random: true } });
    // fewer than min_tickets(5) -> cancelled+refund; lower the bar to force a win
    await db.update(draws).set({ drawTime: new Date(Date.now() - 1000), minTickets: 1 }).where((await import('drizzle-orm')).eq(draws.id, draw.id));
    await runDueDraws();
    const res = (await call('/results?packageId=1')).body.results;
    expect(res).toHaveLength(1);
    expect(res[0].winnerName).toBe('A***');
    const v = (await call(`/draws/${draw.id}/verify`)).body;
    expect(v.serverSeed).toBeTruthy();
    expect((await call(`/draws/${draw.id}`, { token: u.accessToken })).body.iWon).toBe(true);
    expect((await call('/me/wallet', { token: u.accessToken })).body.winnings).toBe(2000);
    const today = new Date().toISOString().slice(0, 10);
    expect((await call(`/results?date=${today}`)).body.results.length).toBe(1);
    expect((await call('/results?date=2001-01-01')).body.results.length).toBe(0);
  });
});
