import { AddressInfo } from 'net';
import type { Server } from 'http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { seed } from '../src/db/seed';
import { runDueDraws } from '../src/services/drawJob';
import { db } from '../src/db';
import { draws, users } from '../src/db/schema';
import { GOOD_PASSWORD, closePool, resetDb, signup } from './helpers';

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
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) as any };
}
/** "name=value" pairs of the Set-Cookie headers, ready to send back as a Cookie header. */
const cookieJar = (h: Headers) => h.getSetCookie().map((c) => c.split(';')[0]).join('; ');
const register = async (username = '9876543210') => (await signup(base, username)).body;

describe('http api', () => {
  it('auth: register, duplicate, login, refresh, /me', async () => {
    const r = await register();
    expect(r.accessToken).toBeTruthy();
    expect((await signup(base, '9876543210', { name: 'Xy', phone: '9123456780' })).status).toBe(409); // User ID taken
    expect((await call('/auth/login', { body: { username: '9876543210', password: 'bad-pass' } })).status).toBe(401);
    expect((await call('/auth/login', { body: { username: 'abc', password: 'x' } })).status).toBe(400); // zod
    const login = await call('/auth/login', { body: { username: '9876543210', password: GOOD_PASSWORD } });
    expect(login.status).toBe(200);
    const ref = await call('/auth/refresh', { body: { refreshToken: login.body.refreshToken } });
    expect(ref.status).toBe(200);
    expect((await call('/auth/refresh', { body: { refreshToken: login.body.accessToken } })).status).toBe(401); // wrong token type
    expect((await call('/me', { token: ref.body.accessToken })).body.user.username).toBe('9876543210');
    expect((await call('/me')).status).toBe(401);
  });

  it('browser apps: tokens only in httpOnly cookies, refresh + logout via cookie, CSRF header required', async () => {
    const client = { 'X-Client': 'user' };
    const reg = await signup(base, '9876500001', { headers: client });
    expect(reg.status).toBe(201);
    expect(reg.body.accessToken).toBeUndefined();
    expect(reg.body.refreshToken).toBeUndefined();
    const set = reg.headers.getSetCookie();
    expect(set).toHaveLength(2);
    for (const c of set) expect(c).toMatch(/HttpOnly/i), expect(c).toMatch(/SameSite=Lax/i);
    expect(set.find((c) => c.startsWith('rt='))).toMatch(/Path=\/api\/v1\/auth/);

    const Cookie = cookieJar(reg.headers);
    expect((await call('/me', { headers: { Cookie, ...client } })).body.user.username).toBe('9876500001');
    expect((await call('/me', { headers: { Cookie } })).status).toBe(200); // reads need no header
    const drawId = (await call('/packages')).body.packages[0].currentDraw.id;
    const buy = { method: 'POST', body: { random: true } };
    expect((await call(`/draws/${drawId}/buy`, { ...buy, headers: { Cookie } })).status).toBe(403); // cookie write without X-Client
    expect((await call(`/draws/${drawId}/buy`, { ...buy, headers: { Cookie, ...client } })).status).toBe(201);

    const ref = await call('/auth/refresh', { method: 'POST', headers: { Cookie, ...client } });
    expect(ref.status).toBe(200);
    expect(ref.headers.getSetCookie()).toHaveLength(2);
    expect((await call('/auth/refresh', { method: 'POST', headers: { Cookie } })).status).toBe(403);
    expect((await call('/auth/refresh', { method: 'POST', headers: client })).status).toBe(401); // no cookie

    const out = await call('/auth/logout', { method: 'POST', headers: { Cookie, ...client } });
    expect(out.headers.getSetCookie().every((c) => /Expires=Thu, 01 Jan 1970/i.test(c))).toBe(true);
  });

  it('admin app cookies are separate from the player app cookies', async () => {
    const admin = await call('/auth/login', { body: { username: '9999999999', password: 'Admin@12345' }, headers: { 'X-Client': 'admin' } });
    const Cookie = cookieJar(admin.headers);
    expect(Cookie).toMatch(/^admin_at=.*; admin_rt=/);
    expect((await call('/me', { headers: { Cookie, 'X-Client': 'admin' } })).body.user.role).toBe('admin');
    expect((await call('/me', { headers: { Cookie, 'X-Client': 'user' } })).status).toBe(401);
  });

  it('passwords are stored salted + hashed (never plaintext, same password -> different hash)', async () => {
    await register('9111111111');
    await register('9222222222');
    const rows = (await db.select().from(users)).filter((u) => u.role === 'user');
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.passwordHash).not.toContain(GOOD_PASSWORD);
      expect(r.passwordHash).toMatch(/^\$2[aby]\$12\$/); // bcrypt, cost 12, salt embedded
    }
    expect(rows[0].passwordHash).not.toBe(rows[1].passwordHash);
  });

  it('packages come from DB (50/100/200/500/1000) and expose mode + seed hash but never the seed', async () => {
    const { body } = await call('/packages');
    expect(body.packages.map((p: any) => [p.price, p.theme])).toEqual([[50, 'green'], [100, 'red'], [200, 'blue'], [500, 'purple'], [1000, 'pink']]);
    const d = body.packages[0].currentDraw;
    expect(d.mode).toBe('random');
    expect(d.serverSeedHash).toMatch(/^[0-9a-f]{64}$/);
    expect(d.serverSeed).toBeNull();
    expect((await call(`/draws/${d.id}/verify`)).status).toBe(409);
  });

  it('buy flow: pick, duplicate, taken, random, wallet + ledger', async () => {
    const a = await register('9000000001');
    const b = await register('9000000002');
    const draw = (await call('/packages')).body.packages[0].currentDraw;
    expect(a.user && (await call('/me/wallet', { token: a.accessToken })).body.balance).toBe(500);

    expect((await call(`/draws/${draw.id}/buy`, { token: a.accessToken, body: { ticketNo: 100005, random: true } })).status).toBe(400);
    const ok = await call(`/draws/${draw.id}/buy`, { token: a.accessToken, body: { ticketNo: 100005 } });
    expect(ok.status).toBe(201);
    expect(ok.body.balance).toBe(450);
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
    expect((await call('/me/daily-claim', { token: a.accessToken, method: 'POST' })).status).toBe(404); // feature removed
    expect((await call(`/draws/${draw.id}`, { token: a.accessToken })).body.myTicketNos).toEqual([100005]);
  });

  it('admin: role guard, mode/select/adjust, audit log; public sees the mode', async () => {
    const user = await register('9000000003');
    expect((await call('/admin/users', { token: user.accessToken })).status).toBe(403);
    const admin = (await call('/auth/login', { body: { username: '9999999999', password: 'Admin@12345' } })).body;
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
    const adjRow = log.find((l: any) => l.action === 'adjust_coins');
    expect([adjRow.adminUsername, adjRow.targetUsername]).toEqual(['9999999999', '9000000003']);
    expect(log.find((l: any) => l.action === 'set_mode').packageName).toBeTruthy();
    const only = (await call('/admin/audit-log?action=set_mode', { token: admin.accessToken })).body.log;
    expect(only.map((l: any) => l.action)).toEqual(['set_mode']);
    const pg = (n: number) => call(`/admin/audit-log?pageSize=2&page=${n}`, { token: admin.accessToken }).then((r) => r.body);
    const [p1, p2] = [await pg(1), await pg(2)];
    expect([p1.total, p1.pages, p1.page, p2.page]).toEqual([3, 2, 1, 2]);
    expect([...p1.log, ...p2.log].map((l: any) => l.id)).toEqual(log.map((l: any) => l.id));
    expect((await pg(3)).log).toEqual([]);
    const pkg = { name: 'Mega', price: 500, prizeType: 'fixed', prizeValue: 9000, maxTickets: 50, theme: 'blue' };
    const create = (schedule: object) => call('/admin/packages', { token: admin.accessToken, body: { ...pkg, ...schedule } });
    expect((await create({ drawIntervalMinutes: 20 })).status).toBe(201);
    expect((await call('/admin/packages', { token: admin.accessToken, body: { ...pkg, theme: 'teal', drawIntervalMinutes: 20 } })).status).toBe(201);
    expect((await create({ drawIntervalMinutes: null, dailyTime: '18:30' })).status).toBe(201);
    expect((await create({ drawIntervalMinutes: 20, dailyTime: '18:30' })).status).toBe(400); // both
    expect((await create({})).status).toBe(400); // neither
    expect((await create({ dailyTime: '25:00' })).status).toBe(400); // bad time
    const daily = (await call('/admin/packages', { token: admin.accessToken })).body.packages.find((p: any) => p.dailyTime === '18:30');
    const patch = (b: object) => call(`/admin/packages/${daily.id}`, { token: admin.accessToken, method: 'PATCH', body: b });
    expect((await patch({ drawIntervalMinutes: 15 })).status).toBe(400); // would leave both set
    expect((await patch({ drawIntervalMinutes: 15, dailyTime: null })).status).toBe(200);
  });

  it('results list only completed draws, never cancelled ones', async () => {
    const draw = (await call('/packages')).body.packages[0].currentDraw;
    await db.update(draws).set({ drawTime: new Date(Date.now() - 1000) }).where((await import('drizzle-orm')).eq(draws.id, draw.id));
    await runDueDraws(); // no tickets sold -> cancelled
    expect((await call('/results?packageId=1')).body.results).toHaveLength(0);
  });

  it('results + verify after a draw completes', async () => {
    const u = await register('9000000004');
    const draw = (await call('/packages')).body.packages[0].currentDraw;
    await call(`/draws/${draw.id}/buy`, { token: u.accessToken, body: { random: true } });
    await db.update(draws).set({ drawTime: new Date(Date.now() - 1000) }).where((await import('drizzle-orm')).eq(draws.id, draw.id));
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

    const admin = (await call('/auth/login', { body: { username: '9999999999', password: 'Admin@12345' } })).body;
    expect((await call('/admin/winners', { token: u.accessToken })).status).toBe(403);
    const winners = (await call('/admin/winners', { token: admin.accessToken })).body.winners;
    expect(winners).toHaveLength(1);
    expect(winners[0]).toMatchObject({ drawId: draw.id, userId: u.user.id, name: 'Asha', username: '9000000004', prizeAmount: 2000, winMethod: 'random' });
  });
});
