import { AddressInfo } from 'net';
import type { Server } from 'http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app';
import { config, productionConfigProblems } from '../src/config';
import { db } from '../src/db';
import { refreshTokens } from '../src/db/schema';
import { GOOD_PASSWORD, closePool, resetDb, signup } from './helpers';

let server: Server;
let base = '';
beforeAll(() => new Promise<void>((r) => { server = createApp().listen(0, () => { base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`; r(); }); }));
afterAll(async () => { server.close(); await closePool(); });
beforeEach(resetDb);

async function call(path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) as any };
}
const register = async (username = 'player_one') =>
  (await signup(base, username)).body as { accessToken: string; refreshToken: string };
const login = (username: string, password: string) => call('/auth/login', { username, password });
const jtiOf = (token: string) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).jti as string;

describe('refresh tokens: rotation + revocation', () => {
  it('each refresh returns a new token and the old one is single-use (after the race grace window)', async () => {
    const s = await register();
    const r1 = await call('/auth/refresh', { refreshToken: s.refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(s.refreshToken);

    // stolen-token replay after the grace window: rejected, and it burns the whole login (family)
    await db.update(refreshTokens).set({ revokedAt: new Date(Date.now() - 60_000), rotatedAt: new Date(Date.now() - 60_000) }).where(eq(refreshTokens.jti, jtiOf(s.refreshToken)));
    expect((await call('/auth/refresh', { refreshToken: s.refreshToken })).status).toBe(401);
    expect((await call('/auth/refresh', { refreshToken: r1.body.refreshToken })).status).toBe(401); // legit holder is logged out too
  });

  it('two tabs refreshing with the same token at once is a race, not theft', async () => {
    const s = await register();
    const [a, b] = await Promise.all([call('/auth/refresh', { refreshToken: s.refreshToken }), call('/auth/refresh', { refreshToken: s.refreshToken })]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect((await call('/auth/refresh', { refreshToken: a.body.refreshToken })).status).toBe(200);
  });

  it('logout revokes the refresh token on the server', async () => {
    const s = await register();
    expect((await call('/auth/logout', { refreshToken: s.refreshToken })).status).toBe(200);
    expect((await call('/auth/refresh', { refreshToken: s.refreshToken })).status).toBe(401);
  });

  it('logout also kills the older token of a rotated chain (no grace after logout)', async () => {
    const s = await register();
    const r1 = await call('/auth/refresh', { refreshToken: s.refreshToken });
    await call('/auth/logout', { refreshToken: r1.body.refreshToken });
    expect((await call('/auth/refresh', { refreshToken: s.refreshToken })).status).toBe(401);
    expect((await call('/auth/refresh', { refreshToken: r1.body.refreshToken })).status).toBe(401);
  });

  it('a validly signed refresh token that the server never issued is rejected', async () => {
    const s = await register();
    await db.delete(refreshTokens);
    expect((await call('/auth/refresh', { refreshToken: s.refreshToken })).status).toBe(401);
  });

  it('browser cookies: logout needs the X-Client header and kills the cookie server-side', async () => {
    const client = { 'X-Client': 'user' };
    const reg = await signup(base, 'cookie_user', { headers: client });
    const cookie = reg.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    expect((await call('/auth/logout', {}, { Cookie: cookie })).status).toBe(403); // CSRF guard
    expect((await call('/auth/logout', {}, { Cookie: cookie, ...client })).status).toBe(200);
    expect((await call('/auth/refresh', {}, { Cookie: cookie, ...client })).status).toBe(401); // cookie replay after logout
  });
});

describe('login lockout', () => {
  it('locks a user ID after LOGIN_MAX_FAILURES wrong passwords, even for the right password', async () => {
    await register('locked_user');
    for (let i = 0; i < config.LOGIN_MAX_FAILURES; i++) expect((await login('locked_user', 'wrong-pass')).status).toBe(401);
    const locked = await login('locked_user', GOOD_PASSWORD);
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');

    // an ID that does not exist locks the same way, so lockouts do not reveal which accounts exist
    for (let i = 0; i < config.LOGIN_MAX_FAILURES; i++) await login('no_such_user', 'whatever');
    expect((await login('no_such_user', 'whatever')).status).toBe(429);
  });

  it('a successful login resets the failure counter', async () => {
    await register('reset_user');
    for (let i = 0; i < config.LOGIN_MAX_FAILURES - 1; i++) await login('reset_user', 'wrong-pass');
    expect((await login('reset_user', GOOD_PASSWORD)).status).toBe(200);
    for (let i = 0; i < config.LOGIN_MAX_FAILURES - 1; i++) expect((await login('reset_user', 'wrong-pass')).status).toBe(401);
    expect((await login('reset_user', GOOD_PASSWORD)).status).toBe(200);
  });
});

describe('production config guard', () => {
  const good = {
    ...config,
    JWT_ACCESS_SECRET: 'a'.repeat(20) + 'X9'.repeat(10),
    JWT_REFRESH_SECRET: 'b'.repeat(20) + 'Y8'.repeat(10),
    ADMIN_PASSWORD: 'Str0ng-and-long-admin-pass',
    SMS_PROVIDER: 'webhook' as const,
    SMS_WEBHOOK_URL: 'https://sms.example.com/send',
  };

  it('accepts strong, explicit secrets', () => {
    expect(productionConfigProblems(good, { ADMIN_PASSWORD: good.ADMIN_PASSWORD })).toEqual([]);
  });

  it('rejects the .env.example placeholders, short/equal secrets and the default admin password', () => {
    const bad = { ...good, JWT_ACCESS_SECRET: 'change-me-access-secret-32chars-min', JWT_REFRESH_SECRET: 'short', ADMIN_PASSWORD: 'Admin@12345' };
    const problems = productionConfigProblems(bad, { ADMIN_PASSWORD: 'Admin@12345' });
    expect(problems.some((p) => p.startsWith('JWT_ACCESS_SECRET'))).toBe(true);
    expect(problems.some((p) => p.startsWith('JWT_REFRESH_SECRET'))).toBe(true);
    expect(problems.some((p) => p.startsWith('ADMIN_PASSWORD'))).toBe(true);
    expect(productionConfigProblems({ ...good, JWT_REFRESH_SECRET: good.JWT_ACCESS_SECRET }, { ADMIN_PASSWORD: 'x' }).join()).toContain('must be different');
  });

  it('requires ADMIN_PASSWORD to be set explicitly (the built-in default does not count)', () => {
    expect(productionConfigProblems(good, {}).join()).toContain('ADMIN_PASSWORD must be set explicitly');
  });

  it('does not trust X-Forwarded-For unless TRUST_PROXY says so', () => {
    expect(config.TRUST_PROXY).toBe(0);
    expect(createApp().get('trust proxy')).toBe(0);
  });
});
