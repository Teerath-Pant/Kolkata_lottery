import { AddressInfo } from 'net';
import type { Server } from 'http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app';
import { config } from '../src/config';
import { db, pool } from '../src/db';
import { idempotencyKeys, users } from '../src/db/schema';
import { seed } from '../src/db/seed';
import { passwordProblem } from '../src/lib/password';
import { adjustCoins } from '../src/services/admin';
import { buyTicket, purgeExpiredIdempotencyKeys } from '../src/services/buy';
import { invalidatePublicCache, publicDraw, publicPackages } from '../src/services/draws';
import { MAX_BALANCE } from '../src/services/wallet';
import { GOOD_PASSWORD, closePool, makeUser, resetDb, signup } from './helpers';

let server: Server;
let base = '';
beforeAll(() => new Promise<void>((r) => { server = createApp().listen(0, () => { base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`; r(); }); }));
afterAll(async () => { server.close(); await closePool(); });
beforeEach(async () => { await resetDb(); await seed(); invalidatePublicCache(); });

async function call(path: string, o: { body?: unknown; token?: string } = {}) {
  const res = await fetch(base + path, {
    method: o.body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) },
    body: o.body ? JSON.stringify(o.body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) as any };
}
describe('signup', () => {
  it('registers with a mobile number, no OTP, one account per number', async () => {
    expect((await signup(base, 'first_user', { phone: '+91 98765 00011' })).status).toBe(201);
    const [u] = await db.select().from(users).where(eq(users.username, 'first_user'));
    expect(u.phone).toBe('9876500011');
    const taken = await signup(base, 'second_user', { phone: '9876500011' });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('PHONE_EXISTS');
    expect((await signup(base, 'bad_phone', { phone: '12345' })).status).toBe(400);
  });
});

describe('password policy', () => {
  it('requires 8+ chars with a letter and a digit and blocks common / personal passwords', () => {
    expect(passwordProblem('Ab1')).toMatch(/at least 8/);
    expect(passwordProblem('abcdefghij')).toMatch(/letter and one digit/);
    expect(passwordProblem('12345678')).toMatch(/letter and one digit/);
    expect(passwordProblem('Password123')).toMatch(/too common/);
    expect(passwordProblem('qwerty123')).toMatch(/too common/);
    expect(passwordProblem('aaaaaaaa1')).toBeNull(); // not all the same char, so allowed by the rules
    expect(passwordProblem('myname2024x', { username: 'myname2024x' })).toMatch(/User ID/);
    expect(passwordProblem('call9876543210', { phone: '9876543210' })).toMatch(/mobile/);
    expect(passwordProblem('x'.repeat(73) + '1')).toMatch(/at most 72/);
    expect(passwordProblem(GOOD_PASSWORD)).toBeNull();
  });

  it('is enforced at signup', async () => {
    const weak = await signup(base, 'weak_user', { password: 'secret1' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.message).toMatch(/password/i);
    expect((await signup(base, 'weak_user', { password: 'Password123' })).status).toBe(400);
    expect((await signup(base, 'weak_user')).status).toBe(201);
  });
});

describe('idempotency keys', () => {
  it('the same key + same request returns the first result and charges once', async () => {
    const u = await makeUser(1000);
    const draw = (await publicPackages())[0].currentDraw!;
    const a = await buyTicket(u.id, draw.id, { random: true }, 'key-12345678');
    const b = await buyTicket(u.id, draw.id, { random: true }, 'key-12345678');
    expect(b).toEqual(a);
    expect(b.balance).toBe(1000 - draw.ticketPrice);
  });

  it('a key cannot be replayed against a different draw or number', async () => {
    const u = await makeUser(1000);
    const [p1, p2] = await publicPackages();
    await buyTicket(u.id, p1.currentDraw!.id, { random: true }, 'key-abcdefgh');
    await expect(buyTicket(u.id, p2.currentDraw!.id, { random: true }, 'key-abcdefgh')).rejects.toMatchObject({ status: 422, code: 'IDEMPOTENCY_KEY_REUSED' });
    await expect(buyTicket(u.id, p1.currentDraw!.id, { ticketNo: 123456 }, 'key-abcdefgh')).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('keys older than a day are ignored and purged', async () => {
    const u = await makeUser(1000);
    const draw = (await publicPackages())[0].currentDraw!;
    await buyTicket(u.id, draw.id, { random: true }, 'key-old-12345');
    await db.update(idempotencyKeys).set({ createdAt: new Date(Date.now() - 25 * 3_600_000) });
    await purgeExpiredIdempotencyKeys();
    expect(await db.select().from(idempotencyKeys)).toHaveLength(0);
  });
});

describe('amount limits', () => {
  it('admin adjustments above ADMIN_MAX_ADJUST are rejected by the API', async () => {
    const admin = await call('/auth/login', { body: { username: config.ADMIN_USERNAME, password: config.ADMIN_PASSWORD } });
    expect(admin.status).toBe(200);
    const u = await makeUser(0);
    const tooBig = await call(`/admin/users/${u.id}/adjust-coins`, { token: admin.body.accessToken, body: { amount: config.ADMIN_MAX_ADJUST + 1, reason: 'too much' } });
    expect(tooBig.status).toBe(400);
    const fine = await call(`/admin/users/${u.id}/adjust-coins`, { token: admin.body.accessToken, body: { amount: config.ADMIN_MAX_ADJUST, reason: 'ok amount' } });
    expect(fine.status).toBe(200);
  });

  it('no wallet can grow past MAX_BALANCE (keeps every amount a safe JS integer)', async () => {
    expect(MAX_BALANCE).toBeLessThan(Number.MAX_SAFE_INTEGER / 1000);
    const u = await makeUser(MAX_BALANCE - 5);
    const [admin] = await db.select().from(users).where(eq(users.username, config.ADMIN_USERNAME));
    await expect(adjustCoins(admin.id, u.id, 10, 'overflow')).rejects.toMatchObject({ code: 'BALANCE_LIMIT' });
    expect((await adjustCoins(admin.id, u.id, 5, 'to the limit')).balance).toBe(MAX_BALANCE);
  });
});

describe('GET /packages load', () => {
  it('uses a handful of queries no matter how many packages/draws there are', async () => {
    const spy = vi.spyOn(pool, 'query');
    const list = await publicPackages();
    const queries = spy.mock.calls.length;
    spy.mockRestore();
    expect(list.length).toBeGreaterThanOrEqual(5);
    expect(queries).toBeLessThanOrEqual(8);
  });

  it('is served from memory for PACKAGES_CACHE_MS, always with a fresh serverTime, and logged-in viewers still see their own tickets', async () => {
    const mutable = config as { PACKAGES_CACHE_MS: number };
    const original = mutable.PACKAGES_CACHE_MS;
    mutable.PACKAGES_CACHE_MS = 60_000;
    try {
      invalidatePublicCache();
      const u = await makeUser(1000);
      const before = await publicPackages(u.id);
      const draw = before[0].currentDraw!;
      expect(draw.myTicketNos).toEqual([]);

      await buyTicket(u.id, draw.id, { random: true });
      const cached = await publicPackages(u.id);
      expect(cached[0].currentDraw!.soldCount).toBe(draw.soldCount); // shared part is cached...
      expect(cached[0].currentDraw!.myTicketNos).toHaveLength(1); // ...the viewer's own data never is
      expect(new Date(cached[0].currentDraw!.serverTime).getTime()).toBeGreaterThanOrEqual(new Date(draw.serverTime).getTime());

      invalidatePublicCache();
      expect((await publicPackages(u.id))[0].currentDraw!.soldCount).toBe(draw.soldCount + 1);
    } finally {
      mutable.PACKAGES_CACHE_MS = original;
      invalidatePublicCache();
    }
  });

  it('single-draw and package-list views agree', async () => {
    const u = await makeUser(1000);
    const list = await publicPackages(u.id);
    const one = await publicDraw(list[1].currentDraw!.id, u.id);
    expect({ ...one, serverTime: '' }).toEqual({ ...list[1].currentDraw!, serverTime: '' });
  });
});
