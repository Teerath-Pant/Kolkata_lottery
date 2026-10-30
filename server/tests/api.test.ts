import { AddressInfo } from 'net';
import type { Server } from 'http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { seed } from '../src/db/seed';
import { executeDraw, runDueDraws } from '../src/services/drawJob';
import { db } from '../src/db';
import { draws, notifications, packages, referralTree, users, walletLedger, wallets } from '../src/db/schema';
import { applyWallet } from '../src/services/wallet';
import { eq } from 'drizzle-orm';
import { GOOD_PASSWORD, closePool, makeDraw, resetDb, signup } from './helpers';

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
// there is no signup bonus, so give every test player 500 purchase coins to play with
const register = async (username = '9876543210') => {
  const body = (await signup(base, username)).body;
  if (body?.user) await db.transaction((tx) => applyWallet(tx, body.user.id, 500, 'admin_adjust'));
  return body;
};

describe('http api', () => {
  it('referral: code required and checked, tree stored with every ancestor', async () => {
    const reg = (u: string, referralCode?: string) => call('/auth/register', { body: { username: u, name: 'Ref', phone: u, password: GOOD_PASSWORD, ...(referralCode === undefined ? {} : { referralCode }) } });
    expect((await reg('9100000001')).status).toBe(400); // no code
    expect((await reg('9100000001', 'NOPE1234')).body.error.code).toBe('INVALID_REFERRAL');

    const [admin] = await db.select().from(users).where(eq(users.role, 'admin'));
    const a = (await reg('9100000001', admin.referralCode.toLowerCase())).body.user; // case-insensitive
    expect(a.referralCode).toMatch(/^[0-9A-F]{8}$/);
    const b = (await reg('9100000002', a.referralCode)).body.user;
    const c = (await reg('9100000003', ` ${b.referralCode} `)).body.user;
    expect((await call('/me', { token: (await call('/auth/login', { body: { username: '9100000003', password: GOOD_PASSWORD } })).body.accessToken })).body.user.referralCode).toBe(c.referralCode);

    const byId = new Map((await db.select().from(users)).map((u) => [u.id, u.referredBy]));
    expect([byId.get(a.id), byId.get(b.id), byId.get(c.id)]).toEqual([admin.id, a.id, b.id]);
    const tree = (await db.select().from(referralTree)).map((t) => [t.ancestorId, t.descendantId, t.depth]);
    expect(tree.sort()).toEqual([
      [admin.id, a.id, 1], [admin.id, b.id, 2], [admin.id, c.id, 3], [a.id, b.id, 1], [a.id, c.id, 2], [b.id, c.id, 1],
    ].sort());

    // no signup bonus; the direct referrer earns Rs 25 in the bonus wallet (only once per new player), an admin's code earns nothing
    const ledger = (await db.select().from(walletLedger)).map((l) => [l.userId, l.type, l.amount, l.refId]);
    expect(ledger.sort()).toEqual([[a.id, 'referral_bonus', 25, b.id], [b.id, 'referral_bonus', 25, c.id]].sort());
    const wallet = async (id: number) => (await db.select().from(wallets).where(eq(wallets.userId, id)))[0];
    expect(await wallet(a.id)).toMatchObject({ balance: 25, purchaseBalance: 0, bonusBalance: 25, incomeBalance: 0 });
    expect(await wallet(b.id)).toMatchObject({ balance: 25, bonusBalance: 25 });
    expect(await wallet(c.id)).toMatchObject({ balance: 0, bonusBalance: 0 });
    const bell = await db.select().from(notifications).where(eq(notifications.userId, a.id));
    expect(bell.map((n) => [n.type, n.body])).toEqual([['referral_bonus', '₹25 added to your bonus wallet: Ref joined with your referral code.']]);
  });

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
    await db.transaction((tx) => applyWallet(tx, reg.body.user.id, 500, 'admin_adjust')); // coins for the buy below
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

  it('packages come from DB (50/100/200/500/1000); no draw mode, seed or verify endpoint is exposed', async () => {
    const { body } = await call('/packages');
    expect(body.packages.map((p: any) => [p.price, p.theme])).toEqual([[50, 'green'], [100, 'red'], [200, 'blue'], [500, 'purple'], [1000, 'pink']]);
    const d = body.packages[0].currentDraw;
    expect([d.mode, d.serverSeedHash, d.serverSeed]).toEqual([undefined, undefined, undefined]);
    expect((await call(`/draws/${d.id}/verify`)).status).toBe(404);
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
    expect(mine[0].livePrize).toBe((await call(`/draws/${draw.id}`)).body.prizeAmount); // ticket shows the live winning prize
    const w = (await call('/me/wallet', { token: a.accessToken })).body;
    expect(w.balance).toBe(450);
    expect(w.recent.map((r: any) => r.type)).toEqual(['ticket_purchase', 'admin_adjust']);
    expect((await call('/me/daily-claim', { token: a.accessToken, method: 'POST' })).status).toBe(404); // feature removed
    expect((await call(`/draws/${draw.id}`, { token: a.accessToken })).body.myTicketNos).toEqual([100005]);
  });

  it('admin: role guard, select/adjust, audit log; selection stays private', async () => {
    const user = await register('9000000003');
    expect((await call('/admin/users', { token: user.accessToken })).status).toBe(403);
    const admin = (await call('/auth/login', { body: { username: '9999999999', password: 'Admin@12345' } })).body;
    expect(admin.user.role).toBe('admin');
    const draw = (await call('/packages')).body.packages[0].currentDraw;
    for (const ticketNo of [100003, 100004]) await call(`/draws/${draw.id}/buy`, { token: user.accessToken, body: { ticketNo } });
    for (const ticketNo of [100003, 100004]) {
      expect((await call(`/admin/draws/${draw.id}/select-winner`, { token: admin.accessToken, body: { ticketNo } })).status).toBe(200);
    }
    expect(JSON.stringify((await call(`/draws/${draw.id}`)).body)).not.toContain('selectedTicketNo');
    const adj = await call(`/admin/users/${user.user.id}/adjust-coins`, { token: admin.accessToken, body: { amount: 25, reason: 'support gift' } });
    expect(adj.body.balance).toBe(425);
    const log = (await call('/admin/audit-log', { token: admin.accessToken })).body.log;
    expect(log.map((l: any) => l.action).sort()).toEqual(['adjust_coins', 'select_winner', 'select_winner']);
    const adjRow = log.find((l: any) => l.action === 'adjust_coins');
    expect([adjRow.adminUsername, adjRow.targetUsername]).toEqual(['9999999999', '9000000003']);
    expect(log.find((l: any) => l.action === 'select_winner').packageName).toBeTruthy();
    const only = (await call('/admin/audit-log?action=adjust_coins', { token: admin.accessToken })).body.log;
    expect(only.map((l: any) => l.action)).toEqual(['adjust_coins']);
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

  it('complaints: player sends + sees own, admin lists + resolves (audited), validation, daily cap, role guard', async () => {
    const a = await register('9000000011');
    const b = await register('9000000012');
    const send = (token: string | undefined, body: object) => call('/me/complaints', { token, body });
    const good = { subject: 'Prize missing', message: 'My winning prize was not credited to my wallet.' };
    expect((await send(undefined, good)).status).toBe(401);
    expect((await send(a.accessToken, { ...good, subject: 'x' })).status).toBe(400);
    expect((await send(a.accessToken, { ...good, message: 'short' })).status).toBe(400);
    expect((await send(a.accessToken, { ...good, message: 'x'.repeat(1001) })).status).toBe(400);
    const made = await send(a.accessToken, good);
    expect(made.status).toBe(201);
    expect(made.body.complaint).toMatchObject({ subject: 'Prize missing', status: 'open' });
    await send(b.accessToken, { subject: 'Other', message: 'Something else is wrong here.' });

    const mine = (await call('/me/complaints', { token: a.accessToken })).body.complaints;
    expect(mine.map((c: any) => c.subject)).toEqual(['Prize missing']); // only own

    expect((await call('/admin/complaints', { token: a.accessToken })).status).toBe(403);
    const admin = (await call('/auth/login', { body: { username: '9999999999', password: 'Admin@12345' } })).body;
    const list = (await call('/admin/complaints', { token: admin.accessToken })).body;
    expect([list.total, list.open]).toEqual([2, 2]);
    expect(list.complaints[0]).toMatchObject({ subject: 'Other', username: '9000000012' }); // newest first
    const id = list.complaints[1].id;

    const patch = (status: string) => call(`/admin/complaints/${id}`, { token: admin.accessToken, method: 'PATCH', body: { status } });
    expect((await patch('bogus')).status).toBe(400);
    expect((await call('/admin/complaints/999999', { token: admin.accessToken, method: 'PATCH', body: { status: 'resolved' } })).status).toBe(404);
    const res = await patch('resolved');
    expect(res.body.complaint.status).toBe('resolved');
    expect(res.body.complaint.resolvedAt).toBeTruthy();
    await patch('resolved'); // no-op, no second audit row
    expect((await call('/admin/complaints?status=open', { token: admin.accessToken })).body.total).toBe(1);
    expect((await call('/me/complaints', { token: a.accessToken })).body.complaints[0].status).toBe('resolved');
    expect((await patch('open')).body.complaint.resolvedAt).toBeNull();
    const log = (await call('/admin/audit-log', { token: admin.accessToken })).body.log;
    expect(log.map((l: any) => l.action)).toEqual(['complaint_reopen', 'complaint_resolve']);
    expect(log[0].targetUsername).toBe('9000000011');

    for (let i = 0; i < 4; i++) expect((await send(a.accessToken, good)).status).toBe(201); // 1 sent so far + 4 = the daily cap of 5
    const over = await send(a.accessToken, good);
    expect([over.status, over.body.error.code]).toEqual([429, 'TOO_MANY_COMPLAINTS']);
  });

  it('complaints: up to 3 optional images, checked by their bytes, size-capped, shown to admin only via their own endpoint', async () => {
    const a = await register('9000000031');
    const admin = (await call('/auth/login', { body: { username: '9999999999', password: 'Admin@12345' } })).body;
    const text = { subject: 'Screenshot', message: 'Here is a screenshot of the problem.' };
    const send = (images?: string[]) => call('/me/complaints', { token: a.accessToken, body: { ...text, ...(images === undefined ? {} : { images }) } });
    const url = (mime: string, head: number[], pad = 64) => `data:${mime};base64,` + Buffer.concat([Buffer.from(head), Buffer.alloc(pad, 1)]).toString('base64');
    const png = url('image/png', [0x89, 0x50, 0x4e, 0x47]);
    const jpg = url('image/jpeg', [0xff, 0xd8, 0xff]);
    const webp = 'data:image/webp;base64,' + Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(16)]).toString('base64');

    const none = await send(); // images are optional
    expect([none.status, none.body.complaint.imageCount]).toEqual([201, 0]);
    const three = await send([png, jpg, webp]);
    expect([three.status, three.body.complaint.imageCount]).toEqual([201, 3]);
    const one = await send([jpg]);
    expect([one.status, one.body.complaint.imageCount]).toEqual([201, 1]);

    const bad = async (images: string[]) => (await send(images)).body.error.code;
    expect(await bad([png, jpg, webp, png])).toBe('VALIDATION'); // 4th picture
    expect(await bad(['not a data url'])).toBe('BAD_IMAGE');
    expect(await bad([png, 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='])).toBe('BAD_IMAGE'); // svg can carry scripts
    expect(await bad(['data:image/png;base64,' + Buffer.from('<html>not a png</html>').toString('base64')])).toBe('BAD_IMAGE'); // header lies
    expect(await bad([png, url('image/jpeg', [0xff, 0xd8, 0xff], 700_001)])).toBe('BAD_IMAGE');
    expect((await call('/admin/complaints', { token: admin.accessToken })).body.total).toBe(3); // rejected ones were not saved at all

    const mine = (await call('/me/complaints', { token: a.accessToken })).body.complaints;
    expect(mine.map((c: any) => c.imageCount)).toEqual([1, 3, 0]);
    expect(JSON.stringify(mine).length).toBeLessThan(2000); // lists never carry pictures
    const list = (await call('/admin/complaints', { token: admin.accessToken })).body.complaints;
    expect(list.map((c: any) => c.imageCount)).toEqual([1, 3, 0]);
    const patched = await call(`/admin/complaints/${list[1].id}`, { token: admin.accessToken, method: 'PATCH', body: { status: 'resolved' } });
    expect(JSON.stringify(patched.body).length).toBeLessThan(1000); // status change never carries pictures

    const images = (id: number, token: string) => call(`/admin/complaints/${id}/images`, { token });
    expect((await images(three.body.complaint.id, a.accessToken)).status).toBe(403);
    expect((await images(three.body.complaint.id, admin.accessToken)).body.images).toEqual([png, jpg, webp]); // same order as sent
    expect((await images(none.body.complaint.id, admin.accessToken)).status).toBe(404);
  });

  it('bulk buy: 10 tickets in one purchase pays Rs 10 once and notifies; fewer, ungrouped or 11th do not; bell can be marked read', async () => {
    const a = await register('9000000041');
    const b = await register('9000000042');
    await db.update(wallets).set({ balance: 10_000, purchaseBalance: 10_000, bonusBalance: 0 }).where(eq(wallets.userId, a.user.id));
    const { draw } = await makeDraw({ price: 50 });
    const buy = (body: object) => call(`/draws/${draw.id}/buy`, { token: a.accessToken, body });
    const bell = async (token = a.accessToken) => (await call('/me/notifications', { token })).body;
    const grp = () => crypto.randomUUID();
    expect((await call('/me/notifications')).status).toBe(401);
    expect((await buy({ random: true, purchaseGroup: 'not-a-uuid' })).status).toBe(400);

    const g1 = grp();
    for (let i = 0; i < 9; i++) expect((await buy({ random: true, purchaseGroup: g1 })).body.bonus).toBe(0);
    expect((await bell()).unread).toBe(0); // 9 tickets: nothing yet
    const tenth = (await buy({ random: true, purchaseGroup: g1 })).body;
    expect([tenth.bonus, tenth.balance]).toEqual([10, 10_000 - 500 + 10]);
    expect((await buy({ random: true, purchaseGroup: g1 })).body.bonus).toBe(0); // 11th in the same purchase: no second bonus

    const w = (await call('/me/wallet', { token: a.accessToken })).body;
    expect(w.recent.find((r: any) => r.type === 'bulk_bonus')).toMatchObject({ amount: 10, refId: draw.id });
    expect(w.bonus).toBeGreaterThanOrEqual(10);

    let n = await bell();
    expect([n.unread, n.notifications.length]).toEqual([1, 1]);
    expect(n.notifications[0]).toMatchObject({ type: 'bulk_bonus', title: 'Bonus added', readAt: null });
    expect(n.notifications[0].body).toContain('₹10');
    expect((await bell(b.accessToken)).notifications).toEqual([]); // private to the player

    for (let i = 0; i < 10; i++) expect((await buy({ random: true })).body.bonus).toBe(0); // no group: ten separate buys earn nothing
    const g2 = grp();
    for (let i = 0; i < 9; i++) await buy({ random: true, purchaseGroup: g2 });
    expect((await bell()).unread).toBe(1); // a second purchase of only 9
    expect((await buy({ random: true, purchaseGroup: g2 })).body.bonus).toBe(10); // its 10th pays again
    n = await bell();
    expect(n.unread).toBe(2);

    // replaying the 10th buy (same Idempotency-Key) must not pay twice
    const g3 = grp(), key = 'bulk-idem-key-1';
    for (let i = 0; i < 9; i++) await buy({ random: true, purchaseGroup: g3 });
    const last = () => call(`/draws/${draw.id}/buy`, { token: a.accessToken, body: { random: true, purchaseGroup: g3 }, headers: { 'Idempotency-Key': key } });
    const first = await last();
    const replay = await last();
    expect([first.body.bonus, replay.body.bonus, replay.body.ticketId]).toEqual([10, 10, first.body.ticketId]);
    expect((await bell()).unread).toBe(3);

    expect((await call('/me/notifications/read', { token: a.accessToken, method: 'POST', body: {} })).status).toBe(200);
    n = await bell();
    expect(n.unread).toBe(0);
    expect(n.notifications.every((x: any) => x.readAt)).toBe(true);

    // the plan is admin-managed: defaults, validation, role guard, new quantity + amount, off switch, audit
    const admin = (await call('/auth/login', { body: { username: '9999999999', password: 'Admin@12345' } })).body;
    const plan = (token: string, body?: object) => call('/admin/settings/bulk-plan', { token, ...(body ? { method: 'PUT', body } : {}) });
    expect((await plan(admin.accessToken)).body).toEqual({ enabled: true, tickets: 10, bonus: 10 });
    expect((await plan(a.accessToken)).status).toBe(403);
    expect((await plan(a.accessToken, { enabled: true, tickets: 3, bonus: 25 })).status).toBe(403);
    for (const bad of [{ tickets: 1, bonus: 5 }, { tickets: 11, bonus: 5 }, { tickets: 3.5, bonus: 5 }, { tickets: 3, bonus: 0 }, { tickets: 3, bonus: -5 }, { tickets: 3 }]) {
      expect((await plan(admin.accessToken, { enabled: true, ...bad })).status).toBe(400);
    }
    expect((await plan(admin.accessToken, { enabled: true, tickets: 3, bonus: 25 })).body).toEqual({ enabled: true, tickets: 3, bonus: 25 });

    const before = (await call('/me/wallet', { token: a.accessToken })).body.balance;
    const g4 = grp();
    expect((await buy({ random: true, purchaseGroup: g4 })).body.bonus).toBe(0);
    expect((await buy({ random: true, purchaseGroup: g4 })).body.bonus).toBe(0);
    const third = (await buy({ random: true, purchaseGroup: g4 })).body;
    expect([third.bonus, third.balance]).toEqual([25, before - 150 + 25]); // 3 tickets x 50, then the new Rs 25 bonus
    n = await bell();
    expect([n.unread, n.notifications[0].body]).toEqual([1, '₹25 bonus added to your bonus wallet for booking 3 tickets in Test.']);

    expect((await plan(admin.accessToken, { enabled: false, tickets: 3, bonus: 25 })).body.enabled).toBe(false);
    const g5 = grp();
    for (let i = 0; i < 3; i++) expect((await buy({ random: true, purchaseGroup: g5 })).body.bonus).toBe(0); // plan off: nothing paid
    expect((await bell()).unread).toBe(1);
    const log = (await call('/admin/audit-log?action=bulk_plan_update', { token: admin.accessToken })).body.log;
    expect(log.length).toBe(2);
    expect(log[1].payload).toMatchObject({ before: { tickets: 10, bonus: 10 }, after: { tickets: 3, bonus: 25 } });
  });

  it('sales window: admin sets a daily ticket buy window on the package, every draw follows it, enforced on buy, shown in both apps, audited', async () => {
    const a = await register('9000000051');
    const admin = (await call('/auth/login', { body: { username: '9999999999', password: 'Admin@12345' } })).body;
    const { pkg, draw } = await makeDraw({ price: 50, drawTime: new Date(Date.now() + 3 * 3600_000) }); // draws in 3 hours
    const MIN = 60_000;
    const ist = (offsetMin: number) => { // "HH:MM" on the Indian clock, offsetMin from now
      const d = new Date(Date.now() + offsetMin * MIN + 330 * MIN);
      return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    };
    const win = (token: string, body: object, id = pkg.id) => call(`/admin/packages/${id}/sales-window`, { token, method: 'PUT', body });
    const setWin = (startMin: number, endMin: number) => win(admin.accessToken, { buyStartTime: ist(startMin), buyEndTime: ist(endMin) });
    const buy = () => call(`/draws/${draw.id}/buy`, { token: a.accessToken, body: { random: true } });
    const view = async () => (await call(`/draws/${draw.id}`)).body;
    const minsFromNow = (iso: string) => (Date.parse(iso) - Date.now()) / MIN;
    const near = (iso: string, mins: number) => Math.abs(minsFromNow(iso) - mins) < 1.1; // the HH:MM clock has no seconds

    // no window: opens when the draw was created, closes 30 s before draw time
    const v0 = await view();
    expect([v0.buyStartTime, v0.buyEndTime]).toEqual([null, null]);
    expect(Date.parse(v0.salesEnd)).toBe(Date.parse(v0.drawTime) - 30_000);

    // role guard, shape, unknown package
    expect((await win(a.accessToken, { buyStartTime: '09:00', buyEndTime: '21:00' })).status).toBe(403);
    expect((await win(admin.accessToken, { buyStartTime: '09:00', buyEndTime: null })).status).toBe(400); // both or neither
    expect((await win(admin.accessToken, { buyStartTime: '09:00', buyEndTime: '09:00' })).status).toBe(400); // must differ
    expect((await win(admin.accessToken, { buyStartTime: '25:00', buyEndTime: '21:00' })).status).toBe(400);
    expect((await win(admin.accessToken, { buyStartTime: '9am', buyEndTime: '9pm' })).status).toBe(400);
    expect((await win(admin.accessToken, { buyStartTime: '09:00', buyEndTime: '21:00' }, 999999)).status).toBe(404);
    expect((await view()).buyStartTime).toBeNull(); // refused edits changed nothing

    // inside the window: buying works, the draw shows the window (end clamps to the draw's own cutoff only when sooner)
    expect((await setWin(-60, 120)).status).toBe(200);
    expect((await buy()).status).toBe(201);
    const v1 = await view();
    expect([v1.buyStartTime, v1.buyEndTime]).toEqual([ist(-60), ist(120)]);
    expect([near(v1.salesStart, -60), near(v1.salesEnd, 120)]).toEqual([true, true]);
    // the package is locked once a ticket is sold, but the buy window can still be changed
    expect((await call(`/admin/packages/${pkg.id}`, { token: admin.accessToken, method: 'PATCH', body: { name: 'Renamed' } })).body.error.code).toBe('PACKAGE_LOCKED');

    // before the window opens today: not started, and the next start is shown
    expect((await setWin(60, 180)).status).toBe(200);
    const early = await buy();
    expect([early.status, early.body.error.code]).toEqual([400, 'SALES_NOT_STARTED']);
    expect(early.body.error.message).toContain('IST');
    expect(near((await view()).salesStart, 60)).toBe(true);

    // after today's window closed: the next window opens after this draw, so this draw is closed
    expect((await setWin(-180, -60)).status).toBe(200);
    const late = await buy();
    expect([late.status, late.body.error.code]).toEqual([400, 'DRAW_CLOSED']);
    const v2 = await view();
    expect(Date.parse(v2.salesStart)).toBeGreaterThanOrEqual(Date.parse(v2.salesEnd));

    // a window that wraps past midnight works too (start later on the clock than end)
    expect((await setWin(-30, -90)).status).toBe(200);
    expect((await buy()).status).toBe(201);

    // clearing it goes back to the default
    expect((await win(admin.accessToken, { buyStartTime: null, buyEndTime: null })).status).toBe(200);
    expect((await buy()).status).toBe(201);
    expect(Date.parse((await view()).salesEnd)).toBe(Date.parse(v0.drawTime) - 30_000);

    // fixed dates: a window opening before the draw is not started yet; one opening only after the draw leaves this draw closed
    const iso = (offsetMin: number) => new Date(Date.now() + offsetMin * MIN).toISOString();
    const at = (s: number, e: number) => ({ buyStartAt: iso(s), buyEndAt: iso(e) });
    expect((await win(admin.accessToken, { ...at(60, 120) })).status).toBe(200);
    const future = await buy();
    expect([future.status, future.body.error.code]).toEqual([400, 'SALES_NOT_STARTED']);
    const vf = await view();
    expect([vf.buyStartTime, near(vf.salesStart, 60), near(vf.salesEnd, 120)]).toEqual([null, true, true]);
    expect((await win(admin.accessToken, { ...at(3 * 1440, 4 * 1440) })).status).toBe(200);
    expect((await buy()).body.error.code).toBe('DRAW_CLOSED'); // the draw (in 3 h) is over before that window opens
    expect((await win(admin.accessToken, { ...at(-60, 60) })).status).toBe(200);
    expect((await buy()).status).toBe(201);
    expect((await win(admin.accessToken, { ...at(-120, -60) })).status).toBe(200);
    expect((await buy()).body.error.code).toBe('DRAW_CLOSED');
    expect((await win(admin.accessToken, { buyStartAt: iso(60), buyEndAt: null })).status).toBe(400); // both or neither
    expect((await win(admin.accessToken, at(120, 60))).status).toBe(400); // end after start
    expect((await win(admin.accessToken, { ...at(-60, 60), buyStartTime: '09:00', buyEndTime: '21:00' })).status).toBe(400); // one kind only
    expect((await win(admin.accessToken, { buyStartAt: 'tomorrow', buyEndAt: 'later' })).status).toBe(400);
    expect((await win(admin.accessToken, { buyStartTime: null, buyEndTime: null })).status).toBe(200); // clearing resets the dates too
    expect((await buy()).status).toBe(201);

    // a new package can be created with a window; half a window is refused
    const mk = (extra: object) => call('/admin/packages', { token: admin.accessToken, body: { name: 'Windowed', price: 10, prizeType: 'fixed', prizeValue: 100, maxTickets: 50, drawIntervalMinutes: 30, theme: 'red', ...extra } });
    const made = await mk({ buyStartTime: '09:00', buyEndTime: '21:30' });
    expect([made.status, made.body.buyStartTime, made.body.buyEndTime]).toEqual([201, '09:00', '21:30']);
    expect((await mk({ buyStartTime: '09:00' })).status).toBe(400);
    const madeAt = await mk({ ...at(2 * 1440, 3 * 1440) });
    expect([madeAt.status, madeAt.body.buyStartAt, madeAt.body.buyStartTime]).toEqual([201, iso(2 * 1440), null].map((v, i) => (i === 1 ? expect.any(String) : v)));
    expect((await mk({ buyStartAt: iso(60) })).status).toBe(400);
    expect((await mk({})).body.buyStartTime).toBeNull();
    const listed = (await call('/admin/packages', { token: admin.accessToken })).body.packages.find((x: any) => x.id === made.body.id);
    expect([listed.buyStartTime, listed.buyEndTime]).toEqual(['09:00', '21:30']);
    const pubPkg = (await call('/packages')).body.packages.find((x: any) => x.id === made.body.id);
    expect([pubPkg.buyStartTime, pubPkg.buyEndTime]).toEqual(['09:00', '21:30']);

    const log = (await call('/admin/audit-log?action=package_sales_window', { token: admin.accessToken })).body.log;
    expect(log.length).toBe(10); // the ten successful edits: five daily, five fixed-date (refused ones are not logged)
    expect(log[0]).toMatchObject({ packageName: 'Test', payload: { after: { start: null, end: null } } });
  });

  it('run once: a package can be scheduled for one single draw, needs a future time, then switches itself off and can be set up again', async () => {
    const admin = (await call('/auth/login', { body: { username: '9999999999', password: 'Admin@12345' } })).body;
    const mk = (extra: object) => call('/admin/packages', { token: admin.accessToken, body: { name: 'Once', price: 10, prizeType: 'fixed', prizeValue: 100, maxTickets: 50, theme: 'blue', ...extra } });
    const patch = (id: number, body: object) => call(`/admin/packages/${id}`, { token: admin.accessToken, method: 'PATCH', body });
    const HOUR = 3600_000;
    const at = new Date(Date.now() + 2 * HOUR).toISOString();
    const drawsOf = async (pkgId: number) => (await db.select().from(draws).where(eq(draws.packageId, pkgId))).sort((x, y) => x.id - y.id);

    // exactly one schedule, and the moment must lie ahead
    expect((await mk({})).status).toBe(400);
    expect((await mk({ runOnceAt: at, drawIntervalMinutes: 30 })).status).toBe(400);
    expect((await mk({ runOnceAt: at, dailyTime: '18:00' })).status).toBe(400);
    expect((await mk({ runOnceAt: new Date(Date.now() - 60_000).toISOString() })).status).toBe(400);
    expect((await mk({ runOnceAt: 'tomorrow' })).status).toBe(400);

    const made = await mk({ runOnceAt: at });
    expect([made.status, made.body.runOnceAt, made.body.drawIntervalMinutes, made.body.dailyTime]).toEqual([201, at, null, null]);
    const pkgId = made.body.id;
    let ds = await drawsOf(pkgId);
    expect([ds.length, ds[0].status, ds[0].drawTime.toISOString()]).toEqual([1, 'open', at]); // its one draw is open, due at the chosen time
    const listed = (await call('/packages')).body.packages.find((x: any) => x.id === pkgId);
    expect(listed.currentDraw.drawTime).toBe(at);

    // the draw runs (nobody bought a ticket): no next draw is opened and the package switches itself off
    expect(await executeDraw(ds[0].id, new Date(Date.now() + 3 * HOUR))).toBe('cancelled_no_tickets');
    ds = await drawsOf(pkgId);
    expect(ds.map((d) => d.status)).toEqual(['cancelled']);
    expect((await call('/packages')).body.packages.some((x: any) => x.id === pkgId)).toBe(false);
    const adminPkg = async () => (await call('/admin/packages', { token: admin.accessToken })).body.packages.find((x: any) => x.id === pkgId);
    expect((await adminPkg()).isActive).toBe(false);

    // set up again: a time in the past is refused, a future time opens a new draw
    await db.update(packages).set({ runOnceAt: new Date(Date.now() - HOUR) }).where(eq(packages.id, pkgId)); // the draw time has really passed by now
    expect((await patch(pkgId, { isActive: true })).status).toBe(400); // the old run-once time has passed
    const again = new Date(Date.now() + 5 * HOUR).toISOString();
    expect((await patch(pkgId, { isActive: true, runOnceAt: again })).status).toBe(200);
    ds = await drawsOf(pkgId);
    expect([ds.length, ds[1].status, ds[1].drawTime.toISOString()]).toEqual([2, 'open', again]);

    // changing the time moves the open draw; switching to an interval clears the run-once time; two schedules are refused
    const moved = new Date(Date.now() + 6 * HOUR).toISOString();
    expect((await patch(pkgId, { runOnceAt: moved })).status).toBe(200);
    expect((await drawsOf(pkgId))[1].drawTime.toISOString()).toBe(moved);
    expect((await patch(pkgId, { drawIntervalMinutes: 30 })).status).toBe(400); // run-once time still set
    expect((await patch(pkgId, { drawIntervalMinutes: 30, runOnceAt: null })).status).toBe(200);
    const p2 = await adminPkg();
    expect([p2.runOnceAt, p2.drawIntervalMinutes]).toEqual([null, 30]);
    expect((await patch(pkgId, { drawIntervalMinutes: null, runOnceAt: moved })).status).toBe(200);
    expect((await drawsOf(pkgId))[1].drawTime.toISOString()).toBe(moved);
  });

  it('live winners: public list of the newest winners with a masked login ID, no cancelled or winnerless draws', async () => {
    const a = await register('9000000061');
    const b = await register('9000000062');
    expect((await call('/winners/recent')).body.winners).toEqual([]);

    const mkDone = async (winner: number | null, amount: number | null, minsAgo: number, status: 'completed' | 'cancelled' = 'completed') => {
      const { draw } = await makeDraw({ price: 50, drawTime: new Date(Date.now() - minsAgo * 60_000) });
      await db.update(draws).set({ status, winnerUserId: winner, prizeAmount: amount, winningTicketNo: winner ? 123456 : null }).where(eq(draws.id, draw.id));
      return draw.id;
    };
    const d1 = await mkDone(a.user.id, 2000, 30); // oldest
    const d2 = await mkDone(b.user.id, 5000, 10); // newest
    await mkDone(null, null, 5); // completed, nobody bought a ticket: no winner
    await mkDone(a.user.id, 999, 1, 'cancelled'); // cancelled: not a result

    const res = await call('/winners/recent'); // no login needed
    expect(res.status).toBe(200);
    expect(res.body.winners.map((w: any) => w.drawId)).toEqual([d2, d1]); // newest first
    expect(res.body.winners[0]).toMatchObject({ winnerId: '90******62', amount: 5000, packageName: 'Test' });
    expect(typeof res.body.winners[0].winnerName).toBe('string');
    expect(JSON.stringify(res.body)).not.toContain('9000000062'); // the full login ID never leaves the server
    expect(res.body.winners[0]).not.toHaveProperty('loginId');

    expect((await call('/winners/recent?limit=1')).body.winners.length).toBe(1);
    expect((await call('/winners/recent?limit=0')).status).toBe(400);
    expect((await call('/winners/recent?limit=21')).status).toBe(400);
  });

  it('two wallets: prizes go to income, other credits to purchase, tickets spend purchase first; dashboard cards add up', async () => {
    const a = await register('9000000071');
    const b = await register('9000000072');
    const admin = (await call('/auth/login', { body: { username: '9999999999', password: 'Admin@12345' } })).body;
    const wallet = async (token = a.accessToken) => (await call('/me/wallet', { token })).body;
    const cards = async () => (await call('/admin/dashboard', { token: admin.accessToken })).body;
    expect((await call('/admin/dashboard', { token: a.accessToken })).status).toBe(403);
    expect((await call('/admin/dashboard')).status).toBe(401);

    // no signup bonus: the 500 the test helper gave is purchase money, the bonus wallet is empty
    expect([(await wallet()).purchaseBalance, (await wallet()).bonusBalance]).toEqual([500, 0]);

    // start from known wallets: a has 300 purchase, b is empty
    await db.update(wallets).set({ balance: 300, purchaseBalance: 300, incomeBalance: 0, bonusBalance: 0 }).where(eq(wallets.userId, a.user.id));
    await db.update(wallets).set({ balance: 0, purchaseBalance: 0, incomeBalance: 0, bonusBalance: 0 }).where(eq(wallets.userId, b.user.id));
    let w = await wallet();
    expect([w.balance, w.purchaseBalance, w.incomeBalance]).toEqual([300, 300, 0]);

    // a prize lands in the income wallet
    const { draw } = await makeDraw({ price: 50, prizeValue: 1000 });
    const { applyWallet } = await import('../src/services/wallet');
    await db.transaction((tx) => applyWallet(tx, a.user.id, 1000, 'prize', draw.id));
    w = await wallet();
    expect([w.balance, w.purchaseBalance, w.incomeBalance]).toEqual([1300, 300, 1000]);

    // approved money lands in the purchase wallet
    const putUpi = await call('/admin/settings/upi', { token: admin.accessToken, method: 'PUT', body: { upiId: 'lucky@upi', payeeName: 'Lucky' } });
    expect(putUpi.status).toBe(200);
    const dep = (await call('/me/deposits', { token: a.accessToken, body: { amount: 200 } })).body.deposit;
    expect((await call(`/admin/deposits/${dep.id}`, { token: admin.accessToken, method: 'PATCH', body: { status: 'approved' } })).status).toBe(200);
    w = await wallet();
    expect([w.balance, w.purchaseBalance, w.incomeBalance]).toEqual([1500, 500, 1000]);

    // dashboard: a (1500 = 500 purchase + 1000 income) is active; b (0 coins) is inactive
    let c = await cards();
    expect(c).toMatchObject({
      totalUsers: 2, activeUsers: 1, inactiveUsers: 1, activeIncomeUsers: 0, pendingFundRequests: 0, completedFundRequests: 1, completedFundAmount: 200,
      totalWithdrawal: 0, pendingWithdrawals: 0, totalWallet: 1500, incomeWallet: 1000, purchaseWallet: 500, bonusWallet: 0,
    });
    // a pending request is counted until it is decided
    await call('/me/deposits', { token: a.accessToken, body: { amount: 100 } });
    expect((await cards()).pendingFundRequests).toBe(1);

    // a ticket (50) is paid from the purchase wallet first
    const buy = (price: number, token = a.accessToken) => call(`/draws/${draw.id}/buy`, { token, body: { random: true } });
    expect((await buy(50)).status).toBe(201);
    w = await wallet();
    expect([w.balance, w.purchaseBalance, w.incomeBalance]).toEqual([1450, 450, 1000]);

    // once purchase is used up, the income wallet pays the rest: spend 450 + 50 more via 10 tickets at 50
    for (let i = 0; i < 9; i++) expect((await buy(50)).status).toBe(201);
    w = await wallet();
    expect([w.balance, w.purchaseBalance, w.incomeBalance]).toEqual([1000, 0, 1000]); // 450 purchase gone after 9 tickets
    expect((await buy(50)).status).toBe(201);
    w = await wallet();
    expect([w.balance, w.purchaseBalance, w.incomeBalance]).toEqual([950, 0, 950]); // now the income wallet pays

    // refunds and admin credits are purchase money; an admin debit also spends purchase first
    await db.transaction((tx) => applyWallet(tx, a.user.id, 40, 'refund', draw.id));
    await db.transaction((tx) => applyWallet(tx, a.user.id, 10, 'admin_adjust'));
    w = await wallet();
    expect([w.balance, w.purchaseBalance, w.incomeBalance]).toEqual([1000, 50, 950]);
    await db.transaction((tx) => applyWallet(tx, a.user.id, -80, 'admin_adjust'));
    w = await wallet();
    expect([w.balance, w.purchaseBalance, w.incomeBalance]).toEqual([920, 0, 920]);

    // the total is always the sum of the three wallets, and overdraft is still refused
    await expect(db.transaction((tx) => applyWallet(tx, a.user.id, -921, 'admin_adjust'))).rejects.toMatchObject({ code: 'INSUFFICIENT_COINS' });
    const [row] = await db.select().from(wallets).where(eq(wallets.userId, a.user.id));
    expect(row.balance).toBe(row.purchaseBalance + row.incomeBalance + row.bonusBalance);
    await expect(db.update(wallets).set({ balance: row.balance + 1 }).where(eq(wallets.userId, a.user.id))).rejects.toThrow();
    c = await cards();
    expect([c.incomeWallet, c.purchaseWallet]).toEqual([920, 0]);

    // bonuses land in the bonus wallet; a debit takes purchase first, then bonus, then income
    await db.transaction((tx) => applyWallet(tx, a.user.id, 60, 'bulk_bonus', draw.id));
    await db.transaction((tx) => applyWallet(tx, a.user.id, 20, 'admin_adjust'));
    w = await wallet();
    expect([w.balance, w.purchaseBalance, w.bonusBalance, w.incomeBalance]).toEqual([1000, 20, 60, 920]);
    await db.transaction((tx) => applyWallet(tx, a.user.id, -50, 'admin_adjust'));
    w = await wallet();
    expect([w.balance, w.purchaseBalance, w.bonusBalance, w.incomeBalance]).toEqual([950, 0, 30, 920]);
    await db.transaction((tx) => applyWallet(tx, a.user.id, -50, 'admin_adjust'));
    w = await wallet();
    expect([w.balance, w.purchaseBalance, w.bonusBalance, w.incomeBalance]).toEqual([900, 0, 0, 900]);
    c = await cards();
    expect([c.incomeWallet, c.bonusWallet, c.purchaseWallet]).toEqual([900, 0, 0]);
  });

  it('block: a blocked player is cut off at once (API, refresh, login) and gets access back when unblocked; players only', async () => {
    const admin = (await call('/auth/login', { body: { username: '9999999999', password: 'Admin@12345' } })).body;
    const a = await register('9000000091');
    const act = (path: string, token = admin.accessToken) => call(`/admin/users/${a.user.id}/${path}`, { token, body: { reason: 'fake accounts' } });
    expect((await act('block', a.accessToken)).status).toBe(403);
    expect((await call(`/admin/users/${admin.user.id}/block`, { token: admin.accessToken, body: {} })).status).toBe(400); // not an admin

    expect((await act('block')).status).toBe(200);
    expect((await call('/me', { token: a.accessToken })).body.error.code).toBe('ACCOUNT_BLOCKED'); // access token still valid, refused anyway
    expect((await call('/auth/refresh', { body: { refreshToken: a.refreshToken } })).status).toBe(401); // every session was ended
    const login = (password = GOOD_PASSWORD) => call('/auth/login', { body: { username: '9000000091', password } });
    expect((await login()).body.error.code).toBe('ACCOUNT_BLOCKED');
    expect((await login('Wrong-pass1')).body.error.code).toBe('BAD_CREDENTIALS'); // a wrong password never says "blocked"
    const report = (await call('/admin/users/report?status=blocked', { token: admin.accessToken })).body;
    expect([report.users.map((u: any) => u.id), report.totals.blocked, !!report.users[0].blockedAt]).toEqual([[a.user.id], 1, true]);
    const log = (await call('/admin/audit-log?action=user_block', { token: admin.accessToken })).body.log;
    expect([log[0].targetUsername, log[0].payload.reason]).toEqual(['9000000091', 'fake accounts']);

    expect((await act('unblock')).status).toBe(200);
    const again = await login();
    expect(again.status).toBe(200);
    expect((await call('/me', { token: again.body.accessToken })).status).toBe(200);
  });

  it('live tickets: running draws with sold counts, and who bought which ticket, newest first; search; admin only', async () => {
    const admin = (await call('/auth/login', { body: { username: '9999999999', password: 'Admin@12345' } })).body;
    const a = await register('9000000103');
    const b = await register('9000000104');
    const pkgs = (await call('/packages')).body.packages;
    const d1 = pkgs[0].currentDraw, d2 = pkgs[1].currentDraw;
    const buy = (who: any, draw: any, ticketNo: number) => call(`/draws/${draw.id}/buy`, { token: who.accessToken, body: { ticketNo } });
    await buy(a, d1, 123456); await buy(b, d1, 123999); await buy(a, d1, 654321); await buy(b, d2, 111111);
    const live = async (qs = '') => (await call(`/admin/live-tickets${qs}`, { token: admin.accessToken })).body;
    expect((await call('/admin/live-tickets', { token: a.accessToken })).status).toBe(403);

    const l = await live();
    expect(l.draws.map((d: any) => [d.id, d.status, d.sold, d.buyers])).toEqual(
      pkgs.map((p: any) => [p.currentDraw.id, 'open', p.currentDraw.id === d1.id ? 3 : p.currentDraw.id === d2.id ? 1 : 0, p.currentDraw.id === d1.id ? 2 : p.currentDraw.id === d2.id ? 1 : 0]));
    expect(l.draws[0]).toMatchObject({ takings: 3 * d1.ticketPrice, selling: true, packageName: pkgs[0].name });
    expect(l.selectedId).toBe(d1.id); // the cheapest package's draw is shown first
    expect(l.tickets.map((t: any) => [t.ticketNo, t.name, t.username])).toEqual([[654321, 'Asha', '9000000103'], [123999, 'Asha', '9000000104'], [123456, 'Asha', '9000000103']]);
    expect(l.total).toBe(3);

    expect((await live(`?drawId=${d2.id}`)).tickets.map((t: any) => t.ticketNo)).toEqual([111111]);
    expect((await live('?drawId=999999')).selectedId).toBe(d1.id); // unknown draw falls back to the first
    expect((await live('?search=1234')).tickets.map((t: any) => t.ticketNo).sort()).toEqual([123456]); // ticket number prefix
    expect((await live('?search=123')).total).toBe(2);
    expect((await live('?search=9000000104')).tickets.map((t: any) => t.ticketNo)).toEqual([123999]); // buyer user ID
    expect((await live('?search=nobody')).total).toBe(0);
    expect((await live('?pageSize=2&page=2')).tickets.map((t: any) => t.ticketNo)).toEqual([123456]);
  });

  it('welcome bonus: a new player gets Rs 50 in the bonus wallet (never the admin), with a bell message; WELCOME_BONUS=0 turns it off', async () => {
    const { config } = await import('../src/config');
    config.WELCOME_BONUS = 50;
    try {
      const a = (await signup(base, '9000000101')).body;
      const w = (await call('/me/wallet', { token: a.accessToken })).body;
      expect([w.balance, w.purchaseBalance, w.bonusBalance, w.incomeBalance, w.bonus]).toEqual([50, 0, 50, 0, 50]);
      expect(w.recent.map((r: any) => [r.type, r.amount])).toEqual([['signup_bonus', 50]]);
      const bell = (await call('/me/notifications', { token: a.accessToken })).body.notifications;
      expect(bell.map((n: any) => [n.type, n.body])).toEqual([['welcome_bonus', '₹50 welcome bonus added to your bonus wallet.']]);

      // the welcome bonus also counts as bonus money the player can spend (purchase first, then bonus)
      const admin = (await call('/auth/login', { body: { username: '9999999999', password: 'Admin@12345' } })).body;
      expect((await call('/me/wallet', { token: admin.accessToken })).body.balance).toBe(0); // the seeded admin got none
      const rep = (await call('/admin/wallet/bonus', { token: admin.accessToken })).body;
      expect(rep.totals).toMatchObject({ signup: 50, received: 50, players: 1 });

      config.WELCOME_BONUS = 0;
      const b = (await signup(base, '9000000102')).body;
      expect((await call('/me/wallet', { token: b.accessToken })).body.balance).toBe(0);
    } finally {
      config.WELCOME_BONUS = 0;
    }
  });

  it('bonus report: who got bonus money from which source, totals, search; statement bonus filter', async () => {
    const admin = (await call('/auth/login', { body: { username: '9999999999', password: 'Admin@12345' } })).body;
    const a = await register('9000000098');
    const [aRow] = await db.select().from(users).where(eq(users.id, a.user.id));
    await signup(base, '9000000099', { referralCode: aRow.referralCode }); // a: referral 25
    await signup(base, '9000000100', { referralCode: aRow.referralCode }); // a: referral 25
    const { draw } = await makeDraw({ price: 50 });
    await db.transaction((tx) => applyWallet(tx, a.user.id, 10, 'bulk_bonus', draw.id)); // a: bulk 10
    await db.transaction((tx) => applyWallet(tx, a.user.id, -20, 'admin_adjust')); // spends 20 of the 500 purchase, bonus untouched
    const rep = async (qs = '') => (await call(`/admin/wallet/bonus${qs}`, { token: admin.accessToken })).body;
    expect((await call('/admin/wallet/bonus', { token: a.accessToken })).status).toBe(403);

    const r = await rep();
    expect(r.players).toHaveLength(1); // only players who received a bonus
    expect(r.players[0]).toMatchObject({ userId: a.user.id, name: 'Asha', username: '9000000098', referral: 50, bulk: 10, signup: 0, received: 60, inWallet: 60, count: 3 });
    expect(r.totals).toEqual({ received: 60, referral: 50, bulk: 10, signup: 0, players: 1, credits: 3, inWallets: 60 });
    expect((await rep('?search=asha')).total).toBe(1);
    expect((await rep('?search=nobody')).total).toBe(0);
    expect((await call('/admin/wallet/bonus?sort=bogus', { token: admin.accessToken })).status).toBe(400);

    const st = (await call(`/admin/wallet/statement?bonus=1&search=${a.user.id}`, { token: admin.accessToken })).body;
    expect(st.rows.map((x: any) => x.type).sort()).toEqual(['bulk_bonus', 'referral_bonus', 'referral_bonus']);
  });

  it('wallet statement: every transaction with name, user ID, type, date, remark, credit / debit, amount; filters, totals, export', async () => {
    const admin = (await call('/auth/login', { body: { username: '9999999999', password: 'Admin@12345' } })).body;
    const a = await register('9000000095'); // the helper credits 500 (admin_adjust without a note)
    const [aRow] = await db.select().from(users).where(eq(users.id, a.user.id));
    await signup(base, '9000000096', { referralCode: aRow.referralCode, name: 'Bina' }); // a earns 25
    await call(`/admin/users/${a.user.id}/adjust-coins`, { token: admin.accessToken, body: { amount: -40, reason: 'duplicate deposit' } });
    const draw = (await call('/packages')).body.packages[0].currentDraw;
    await call(`/draws/${draw.id}/buy`, { token: a.accessToken, body: { random: true } });
    const st = async (qs = '') => (await call(`/admin/wallet/statement${qs}`, { token: admin.accessToken })).body;
    expect((await call('/admin/wallet/statement', { token: a.accessToken })).status).toBe(403);

    const all = await st(`?search=${a.user.id}`); // exact member ID
    expect(all.rows.map((r: any) => [r.type, r.direction, r.amount, r.remark])).toEqual([
      ['ticket_purchase', 'debit', -50, `Ticket bought · ${draw.packageName} · draw #${draw.id}`],
      ['admin_adjust', 'debit', -40, 'Admin adjustment · duplicate deposit'],
      ['referral_bonus', 'credit', 25, 'Referral bonus · Bina (9000000096) joined'],
      ['admin_adjust', 'credit', 500, 'Admin adjustment'],
    ]);
    expect(all.rows[0]).toMatchObject({ name: 'Asha', username: '9000000095', userId: a.user.id, balanceAfter: 435, drawId: draw.id });
    expect(all.summary).toEqual({ count: 4, credit: 525, debit: 90, net: 435 });
    expect(all.types).toEqual({ ticket_purchase: 1, admin_adjust: 2, referral_bonus: 1 });

    expect((await st('?direction=credit&search=9000000095')).rows.map((r: any) => r.amount)).toEqual([25, 500]);
    const typed = await st('?type=admin_adjust&search=9000000095');
    expect([typed.total, typed.types.ticket_purchase]).toEqual([2, 1]); // chip counts ignore the type filter
    expect((await st('?search=asha')).total).toBe(4); // name, any case
    expect((await st('?search=Bina')).total).toBe(0); // b has no wallet transactions (no signup bonus)
    expect((await st('?to=2000-01-01')).total).toBe(0);
    const p2 = await st('?pageSize=1&page=2');
    expect([p2.rows.length, p2.pages]).toEqual([1, p2.total]);
    expect((await st('?export=1&pageSize=1')).rows.length).toBe(p2.total);
    expect((await call('/admin/wallet/statement?type=bogus', { token: admin.accessToken })).status).toBe(400);
  });

  it('withdrawal: request takes nothing; approve takes it income wallet first; reject takes nothing; one at a time', async () => {
    const admin = (await call('/auth/login', { body: { username: '9999999999', password: 'Admin@12345' } })).body;
    const a = await register('9000000097'); // 500 purchase
    const { draw } = await makeDraw({ price: 50 });
    await db.transaction((tx) => applyWallet(tx, a.user.id, 1000, 'prize', draw.id));
    await db.transaction((tx) => applyWallet(tx, a.user.id, 30, 'bulk_bonus', draw.id));
    const wallet = async () => (await call('/me/wallet', { token: a.accessToken })).body;
    const ask = (body: object) => call('/me/withdrawals', { token: a.accessToken, body: { upiId: 'asha@okaxis', holderName: 'Asha Devi', ...body } });
    const review = (wid: number, body: object) => call(`/admin/withdrawals/${wid}`, { token: admin.accessToken, method: 'PATCH', body });

    expect((await call('/me/withdraw-info', { token: a.accessToken })).body).toMatchObject({ min: 100, balance: 1530, order: ['income', 'purchase', 'bonus'], lastPayout: null, pending: null });
    expect((await ask({ amount: 50 })).body.error.code).toBe('WITHDRAW_MIN');
    expect((await ask({ amount: 1531 })).body.error.code).toBe('INSUFFICIENT_COINS');
    expect((await ask({ amount: 200, upiId: 'not-a-upi' })).status).toBe(400);

    const w1 = (await ask({ amount: 1200 })).body.withdrawal;
    expect(w1).toMatchObject({ amount: 1200, status: 'pending' });
    expect((await wallet()).balance).toBe(1530); // nothing taken yet
    expect((await ask({ amount: 100 })).body.error.code).toBe('WITHDRAWAL_PENDING');
    expect((await call(`/admin/withdrawals/${w1.id}`, { token: a.accessToken, method: 'PATCH', body: { status: 'approved' } })).status).toBe(403);
    const inbox = (await call('/admin/withdrawals?status=pending', { token: admin.accessToken })).body;
    expect([inbox.counts.pending, inbox.pendingTotal, inbox.withdrawals[0].balance]).toEqual([1, 1200, 1530]);

    // approve: income 1000 first, then 200 of the purchase money; the bonus is untouched
    expect((await review(w1.id, { status: 'approved', payoutRef: 'UPI123456' })).body.withdrawal)
      .toMatchObject({ status: 'approved', fromIncome: 1000, fromPurchase: 200, fromBonus: 0, payoutRef: 'UPI123456' });
    let w = await wallet();
    expect([w.balance, w.incomeBalance, w.purchaseBalance, w.bonusBalance]).toEqual([330, 0, 300, 30]);
    expect(w.recent[0]).toMatchObject({ type: 'withdrawal', amount: -1200, refId: w1.id });
    expect((await review(w1.id, { status: 'rejected' })).body.error.code).toBe('ALREADY_REVIEWED');
    const bell = (await call('/me/notifications', { token: a.accessToken })).body.notifications;
    expect(bell[0]).toMatchObject({ type: 'withdrawal_approved', body: '₹1200 is being sent to asha@okaxis (ref UPI123456).' });
    expect((await call('/admin/dashboard', { token: admin.accessToken })).body).toMatchObject({ totalWithdrawal: 1200, pendingWithdrawals: 0 });
    const st = (await call('/admin/wallet/statement?type=withdrawal', { token: admin.accessToken })).body;
    expect(st.rows[0]).toMatchObject({ direction: 'debit', amount: -1200, remark: `Withdrawal #${w1.id} · to asha@okaxis · ref UPI123456` });

    // reject: nothing taken
    const w2 = (await ask({ amount: 300 })).body.withdrawal;
    expect((await review(w2.id, { status: 'rejected', note: 'UPI name does not match' })).body.withdrawal).toMatchObject({ status: 'rejected', note: 'UPI name does not match' });
    expect((await wallet()).balance).toBe(330);
    expect((await call('/me/withdraw-info', { token: a.accessToken })).body.lastPayout).toEqual({ upiId: 'asha@okaxis', holderName: 'Asha Devi' });

    // spent in the meantime: approve is refused, the request stays pending
    const w3 = (await ask({ amount: 330 })).body.withdrawal;
    await db.transaction((tx) => applyWallet(tx, a.user.id, -100, 'admin_adjust'));
    const refused = await review(w3.id, { status: 'approved' });
    expect([refused.status, refused.body.error.message]).toEqual([402, 'The player has only ₹230 now, less than the ₹330 asked. Reject this request instead.']);
    expect((await call('/me/withdrawals', { token: a.accessToken })).body.withdrawals.map((x: any) => x.status)).toEqual(['pending', 'rejected', 'approved']);
  });

  it('players report: every player with overall numbers, filters (active / inactive / income), search, sort, paging, totals', async () => {
    const admin = (await call('/auth/login', { body: { username: '9999999999', password: 'Admin@12345' } })).body;
    const a = await register('9000000081');
    const b = await register('9000000082');
    const c = await register('9000000083');
    const report = async (qs = '') => (await call(`/admin/users/report${qs}`, { token: admin.accessToken })).body;
    const { applyWallet } = await import('../src/services/wallet');
    expect((await call('/admin/users/report', { token: a.accessToken })).status).toBe(403);

    // a: adds 200 and buys 2 tickets at 50; b: wins a 1000 prize (one draw won); c: empty wallet
    for (const u of [a, b, c]) await db.update(wallets).set({ balance: 0, purchaseBalance: 0, incomeBalance: 0, bonusBalance: 0 }).where(eq(wallets.userId, u.user.id));
    await call('/admin/settings/upi', { token: admin.accessToken, method: 'PUT', body: { upiId: 'lucky@upi', payeeName: 'Lucky' } });
    const dep = (await call('/me/deposits', { token: a.accessToken, body: { amount: 200 } })).body.deposit;
    await call(`/admin/deposits/${dep.id}`, { token: admin.accessToken, method: 'PATCH', body: { status: 'approved' } });
    await call('/me/deposits', { token: a.accessToken, body: { amount: 70 } }); // stays pending
    const { draw } = await makeDraw({ price: 50 });
    for (let i = 0; i < 2; i++) expect((await call(`/draws/${draw.id}/buy`, { token: a.accessToken, body: { random: true } })).status).toBe(201);
    const { draw: won } = await makeDraw({ price: 50 });
    await db.update(draws).set({ status: 'completed', winnerUserId: b.user.id, prizeAmount: 1000, winningTicketNo: 123456 }).where(eq(draws.id, won.id));
    await db.transaction((tx) => applyWallet(tx, b.user.id, 1000, 'prize', won.id));

    const all = await report();
    expect(all.total).toBe(3); // players only, the admin is not listed
    expect(all.users.map((u: any) => u.id)).toEqual([c.user.id, b.user.id, a.user.id]); // newest first
    const ra = all.users.find((u: any) => u.id === a.user.id);
    expect(ra).toMatchObject({ deposited: 200, spent: 100, tickets: 2, wins: 0, won: 0, pendingRequests: 1, balance: 100, purchaseBalance: 100, incomeBalance: 0, active: true, referredByName: 'Admin' });
    expect(ra.lastTicketAt).toBeTruthy();
    const rb = all.users.find((u: any) => u.id === b.user.id);
    expect(rb).toMatchObject({ won: 1000, wins: 1, tickets: 0, balance: 1000, incomeBalance: 1000, purchaseBalance: 0, active: true, lastTicketAt: null });
    expect(all.users.find((u: any) => u.id === c.user.id)).toMatchObject({ balance: 0, active: false, deposited: 0 });
    expect(all.totals).toMatchObject({ players: 3, active: 2, inactive: 1, income: 0, balance: 1100, incomeBalance: 1000, purchaseBalance: 100, deposited: 200, won: 1000, spent: 100 });

    // filters
    expect((await report('?status=active')).users.map((u: any) => u.id).sort()).toEqual([a.user.id, b.user.id].sort());
    expect((await report('?status=inactive')).users.map((u: any) => u.id)).toEqual([c.user.id]);
    expect((await report('?status=income')).total).toBe(0); // no income plan yet
    // search (name / login ID / phone; like-wildcards are taken literally)
    expect((await report('?search=000083')).users.map((u: any) => u.id)).toEqual([c.user.id]);
    expect((await report('?search=%25')).total).toBe(0);
    // sort
    expect((await report('?sort=deposited')).users[0].id).toBe(a.user.id);
    expect((await report('?sort=won')).users[0].id).toBe(b.user.id);
    expect((await report('?sort=lastPlayed')).users[0].id).toBe(a.user.id);
    expect((await report('?sort=balance')).users[0].id).toBe(b.user.id);
    // paging
    const p2 = await report('?pageSize=1&page=2');
    expect([p2.total, p2.pages, p2.users.length, p2.users[0].id]).toEqual([3, 3, 1, b.user.id]);
    expect((await call('/admin/users/report?sort=bogus', { token: admin.accessToken })).status).toBe(400);

    // search one field: user ID, member ID (id or referral code), name, phone, sponsor; joining date in IST days
    const ids = async (qs: string) => (await report(qs)).users.map((u: any) => u.id).sort();
    const [cRow] = await db.select().from(users).where(eq(users.id, c.user.id));
    expect(await ids('?searchBy=userId&search=000083')).toEqual([c.user.id]);
    expect(await ids('?searchBy=name&search=000083')).toEqual([]);
    expect(await ids(`?searchBy=memberId&search=${c.user.id}`)).toEqual([c.user.id]);
    expect(await ids(`?searchBy=memberId&search=${cRow.referralCode.toLowerCase()}`)).toEqual([c.user.id]);
    expect(await ids(`?searchBy=phone&search=${cRow.phone}`)).toEqual([c.user.id]);
    expect(await ids(`?search=${c.user.id}`)).toEqual([c.user.id]); // any field: the exact member ID
    const d = (await signup(base, '9000000084', { referralCode: cRow.referralCode })).body;
    expect(await ids('?searchBy=sponsor&search=9000000083')).toEqual([d.user.id]);
    expect(await ids(`?searchBy=sponsor&search=${cRow.referralCode}`)).toEqual([d.user.id]);
    expect((await report(`?search=9000000083`)).users.map((u: any) => u.id)).toEqual([c.user.id]); // any field skips sponsors
    const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10); // IST date
    expect((await report(`?joinedFrom=${today}&joinedTo=${today}`)).total).toBe(4);
    expect((await report('?joinedTo=2000-01-01')).total).toBe(0);
    expect((await call('/admin/users/report?joinedFrom=2026-13-45', { token: admin.accessToken })).status).toBe(400);
  });

  it('deposits: player requests add money, admin approves (credits once, audited) or rejects, pending cap, UTR reuse, role guard', async () => {
    const a = await register('9000000021');
    const admin = (await call('/auth/login', { body: { username: '9999999999', password: 'Admin@12345' } })).body;
    const send = (body: object) => call('/me/deposits', { token: a.accessToken, body });
    const putUpi = (token: string, body: object) => call('/admin/settings/upi', { token, method: 'PUT', body });

    // add money starts off; only an admin can set the UPI details, and a bad ID is refused
    expect((await call('/deposit-info', { token: a.accessToken })).body).toEqual({ upiId: null, payeeName: 'Lucky Ticket Draw' });
    expect((await send({ amount: 500 })).body.error.code).toBe('DEPOSITS_OFF');
    expect((await putUpi(a.accessToken, { upiId: 'lucky@upi', payeeName: 'Lucky' })).status).toBe(403);
    expect((await putUpi(admin.accessToken, { upiId: 'no-at-sign', payeeName: 'Lucky' })).status).toBe(400);
    expect((await putUpi(admin.accessToken, { upiId: 'lucky@upi', payeeName: '' })).status).toBe(400);
    expect((await putUpi(admin.accessToken, { upiId: ' lucky@upi ', payeeName: 'Lucky Draw' })).body).toEqual({ upiId: 'lucky@upi', payeeName: 'Lucky Draw' });
    expect((await call('/admin/settings/upi', { token: admin.accessToken })).body.upiId).toBe('lucky@upi');
    expect((await call('/deposit-info', { token: a.accessToken })).body).toEqual({ upiId: 'lucky@upi', payeeName: 'Lucky Draw' });
    expect((await call('/me/deposits', { body: { amount: 500 } })).status).toBe(401);
    expect((await send({ amount: 0 })).status).toBe(400);
    expect((await send({ amount: 500, utr: 'bad utr!' })).status).toBe(400);
    const made = await send({ amount: 500, utr: 'UTR123456' });
    expect(made.status).toBe(201);
    expect(made.body.deposit).toMatchObject({ amount: 500, utr: 'UTR123456', status: 'pending' });
    expect((await send({ amount: 100, utr: 'UTR123456' })).body.error.code).toBe('UTR_USED');
    const second = (await send({ amount: 200 })).body.deposit;
    await send({ amount: 300 });
    const over = await send({ amount: 400 });
    expect([over.status, over.body.error.code]).toEqual([429, 'TOO_MANY_DEPOSITS']);

    const balance = async () => (await call('/me/wallet', { token: a.accessToken })).body;
    const start = (await balance()).balance;
    expect((await call('/admin/deposits', { token: a.accessToken })).status).toBe(403);
    const list = (await call('/admin/deposits?status=pending', { token: admin.accessToken })).body;
    expect([list.total, list.pending]).toEqual([3, 3]);
    expect(list.deposits[2]).toMatchObject({ amount: 500, username: '9000000021' }); // newest first

    const review = (id: number, status: string) => call(`/admin/deposits/${id}`, { token: admin.accessToken, method: 'PATCH', body: { status } });
    expect((await review(made.body.deposit.id, 'pending')).status).toBe(400);
    expect((await review(999999, 'approved')).status).toBe(404);
    expect((await review(made.body.deposit.id, 'approved')).body.deposit.status).toBe('approved');
    expect((await review(made.body.deposit.id, 'approved')).status).toBe(409); // never credited twice
    expect((await review(made.body.deposit.id, 'rejected')).status).toBe(409);
    expect((await review(second.id, 'rejected')).body.deposit.status).toBe('rejected');
    const w = await balance();
    expect([w.balance, w.deposit]).toEqual([start + 500, 500]);
    expect(w.recent[0]).toMatchObject({ type: 'deposit', amount: 500, refId: made.body.deposit.id });

    expect((await send({ amount: 400 })).status).toBe(201); // 1 pending + 1 = under the cap again
    const mine = (await call('/me/deposits', { token: a.accessToken })).body.deposits;
    expect(mine.map((d: any) => d.status)).toEqual(['pending', 'pending', 'rejected', 'approved']);
    const log = (await call('/admin/audit-log', { token: admin.accessToken })).body.log;
    expect(log.map((l: any) => l.action)).toEqual(['deposit_reject', 'deposit_approve', 'upi_update']);
    expect(log[1]).toMatchObject({ targetUsername: '9000000021', payload: { amount: 500, balance: start + 500 } });

    // history: decided requests, newest decision first, with who decided; counts per status and the approved total
    const hist = (await call('/admin/deposits?status=history', { token: admin.accessToken })).body;
    expect(hist.deposits.map((x: any) => [x.id, x.status])).toEqual([[second.id, 'rejected'], [made.body.deposit.id, 'approved']]);
    expect(hist.deposits[1]).toMatchObject({ reviewedByName: 'Admin', amount: 500, utr: 'UTR123456' });
    expect(hist.deposits[1].reviewedAt).toBeTruthy();
    expect(hist).toMatchObject({ total: 2, counts: { pending: 2, approved: 1, rejected: 1 }, approvedTotal: 500 });
    expect((await call('/admin/deposits?status=approved', { token: admin.accessToken })).body.deposits.map((x: any) => x.id)).toEqual([made.body.deposit.id]);
    expect((await call('/admin/deposits?status=bogus', { token: admin.accessToken })).status).toBe(400);

    const bell = (await call('/me/notifications', { token: a.accessToken })).body;
    expect(bell.unread).toBe(2);
    expect(bell.notifications.map((x: any) => [x.type, x.title])).toEqual([['deposit_rejected', 'Request rejected'], ['deposit_approved', 'Money added']]);
    expect(bell.notifications[1].body).toContain('₹500');

    // clearing the UPI ID turns add money off again
    expect((await putUpi(admin.accessToken, { upiId: '', payeeName: 'Lucky Draw' })).body.upiId).toBeNull();
    expect((await send({ amount: 100 })).body.error.code).toBe('DEPOSITS_OFF');
  });

  it('results list only completed draws, never cancelled ones', async () => {
    const draw = (await call('/packages')).body.packages[0].currentDraw;
    await db.update(draws).set({ drawTime: new Date(Date.now() - 1000) }).where((await import('drizzle-orm')).eq(draws.id, draw.id));
    await runDueDraws(); // no tickets sold -> cancelled
    expect((await call('/results?packageId=1')).body.results).toHaveLength(0);
  });

  it('results after the admin announces the winning ticket', async () => {
    const u = await register('9000000004');
    const draw = (await call('/packages')).body.packages[0].currentDraw;
    await call(`/draws/${draw.id}/buy`, { token: u.accessToken, body: { ticketNo: 123456 } });
    await db.update(draws).set({ drawTime: new Date(Date.now() - 1000) }).where((await import('drizzle-orm')).eq(draws.id, draw.id));
    await runDueDraws(); // nothing selected: the draw waits for the admin
    expect((await call(`/draws/${draw.id}`)).body.status).toBe('drawing');
    expect((await call('/results?packageId=1')).body.results).toHaveLength(0);

    const admin = (await call('/auth/login', { body: { username: '9999999999', password: 'Admin@12345' } })).body;
    const pickNo = (ticketNo: number, token: string) => call(`/admin/draws/${draw.id}/select-winner`, { token, body: { ticketNo } });
    expect((await pickNo(123456, u.accessToken)).status).toBe(403);
    expect((await pickNo(654321, admin.accessToken)).body.error.code).toBe('TICKET_NOT_SOLD');
    expect((await pickNo(123456, admin.accessToken)).body).toMatchObject({ announced: true });
    const res = (await call('/results?packageId=1')).body.results;
    expect(res).toHaveLength(1);
    expect(res[0].winnerName).toBe('Asha'); // full name, as shown on the winning ticket
    expect((await call(`/draws/${draw.id}`, { token: u.accessToken })).body.iWon).toBe(true);
    expect((await call('/me/wallet', { token: u.accessToken })).body.winnings).toBe(2000);
    const today = new Date().toISOString().slice(0, 10);
    expect((await call(`/results?date=${today}`)).body.results.length).toBe(1);
    expect((await call('/results?date=2001-01-01')).body.results.length).toBe(0);

    expect((await call('/admin/winners', { token: u.accessToken })).status).toBe(403);
    const winners = (await call('/admin/winners', { token: admin.accessToken })).body.winners;
    expect(winners).toHaveLength(1);
    expect(winners[0]).toMatchObject({ drawId: draw.id, userId: u.user.id, name: 'Asha', username: '9000000004', prizeAmount: 2000, winMethod: 'admin_selected' });
  });
});
