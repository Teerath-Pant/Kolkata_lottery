import { describe, expect, it } from 'vitest';
import { prefixMatch, defaultTierPrizes, TIER_DIGITS } from '../src/lib/tiers';
import { passwordProblem } from '../src/lib/password';
import { sha256, newSeed } from '../src/lib/fair';
import { signTokens, verifyToken } from '../src/lib/auth';
import { productionConfigProblems } from '../src/config';
import { computePrize, maskId, nextDrawTime, nextDrawFor, salesWindow } from '../src/services/draws';
import { normalizeReferralCode } from '../src/services/account';

// Pure functions only: no database, no HTTP. Fast and deterministic.

describe('tiers.prefixMatch', () => {
  it('counts the unbroken run of matching leading digits', () => {
    expect(prefixMatch(123456, 123999)).toBe(3);
    expect(prefixMatch(123456, 123456)).toBe(6); // all six = the jackpot ticket
    expect(prefixMatch(123456, 923456)).toBe(0); // first digit differs
    expect(prefixMatch(123456, 120456)).toBe(2); // break at the third digit stops the run
  });
});

describe('tiers.defaultTierPrizes', () => {
  it('scales with the ticket price and never drops below 1', () => {
    expect(defaultTierPrizes(50)).toEqual({ 1: 5, 2: 25, 3: 100, 4: 500, 5: 2000 });
    const tiny = defaultTierPrizes(1);
    expect(TIER_DIGITS.every((k) => tiny[k] >= 1)).toBe(true); // 0.1 rounds to 0 -> clamped to 1
  });
});

describe('password.passwordProblem', () => {
  it('accepts a strong password', () => {
    expect(passwordProblem('Tiger9shed')).toBeNull();
  });
  it('rejects weak, common, repeated, or personal passwords', () => {
    expect(passwordProblem('short1')).toMatch(/at least 8/);
    expect(passwordProblem('a'.repeat(73) + '1')).toMatch(/at most 72/);
    expect(passwordProblem('allletters')).toMatch(/letter and one digit/);
    expect(passwordProblem('12345678')).toMatch(/letter and one digit/);
    expect(passwordProblem('password123')).toMatch(/too common/);
    expect(passwordProblem('PASSWORD123')).toMatch(/too common/); // case-insensitive
    expect(passwordProblem('rahul9kumar', { username: 'rahul9kumar' })).toMatch(/your User ID/);
    expect(passwordProblem('x9876543210y', { phone: '9876543210' })).toMatch(/your mobile number/);
  });
});

describe('auth tokens', () => {
  it('round-trips an access token and rejects the wrong type or tampering', () => {
    const { accessToken, refreshToken, refresh } = signTokens({ id: 7, role: 'admin' });
    expect(verifyToken(accessToken, 'access')).toMatchObject({ id: 7, role: 'admin' });
    expect(verifyToken(refreshToken, 'refresh')).toMatchObject({ id: 7, role: 'admin', jti: refresh.jti, fam: refresh.familyId });
    expect(() => verifyToken(accessToken, 'refresh')).toThrow(); // access token is not a refresh token
    expect(() => verifyToken(refreshToken, 'access')).toThrow();
    expect(() => verifyToken(accessToken + 'x', 'access')).toThrow(); // tampered signature
    expect(() => verifyToken('not.a.token', 'access')).toThrow();
  });
  it('gives each token a unique id and family', () => {
    const a = signTokens({ id: 1, role: 'user' });
    const b = signTokens({ id: 1, role: 'user' });
    expect(a.refresh.jti).not.toBe(b.refresh.jti);
    expect(a.refresh.familyId).not.toBe(b.refresh.familyId);
  });
});

describe('config.productionConfigProblems', () => {
  const ok = {
    JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40), ADMIN_PASSWORD: 'S0me-Long-Pass!',
  } as any;
  it('passes a safe production config', () => {
    expect(productionConfigProblems(ok, { ADMIN_PASSWORD: 'set' } as any)).toEqual([]);
  });
  it('flags placeholder secrets, equal secrets, and the default admin password', () => {
    expect(productionConfigProblems({ ...ok, JWT_ACCESS_SECRET: 'change-me-please-xxxx' }, { ADMIN_PASSWORD: 'set' } as any)[0]).toMatch(/JWT_ACCESS_SECRET/);
    expect(productionConfigProblems({ ...ok, JWT_ACCESS_SECRET: 'short' }, { ADMIN_PASSWORD: 'set' } as any)[0]).toMatch(/at least 32/);
    expect(productionConfigProblems({ ...ok, JWT_REFRESH_SECRET: ok.JWT_ACCESS_SECRET }, { ADMIN_PASSWORD: 'set' } as any)).toContain('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
    expect(productionConfigProblems(ok, {} as any)).toContain('ADMIN_PASSWORD must be set explicitly'); // not in env
    expect(productionConfigProblems({ ...ok, ADMIN_PASSWORD: 'Admin@12345' }, { ADMIN_PASSWORD: 'set' } as any)[0]).toMatch(/ADMIN_PASSWORD/);
  });
});

describe('draws.maskId (login id is PII)', () => {
  it('shows only the first and last two digits', () => {
    expect(maskId('9876543210')).toBe('98******10');
    expect(maskId('1234')).toBe('1***'); // short ids keep only the first
    expect(maskId('123456789012')).toBe('12******12'); // mask is capped at 6 stars
  });
});

describe('draws.computePrize', () => {
  it('fixed prize ignores sales; pool is a floored percentage of takings', () => {
    expect(computePrize({ prizeType: 'fixed', prizeValue: 50_000, ticketPrice: 5 }, 999)).toBe(50_000);
    expect(computePrize({ prizeType: 'pool_percent', prizeValue: 50, ticketPrice: 10 }, 7)).toBe(35); // floor(7*10*50/100)
    expect(computePrize({ prizeType: 'pool_percent', prizeValue: 50, ticketPrice: 10 }, 0)).toBe(0);
  });
});

describe('draws.nextDrawTime (interval grid)', () => {
  it('returns the next slot strictly after `after`, on the grid anchored at `anchor`', () => {
    const anchor = new Date('2026-01-01T00:00:00Z');
    expect(nextDrawTime(anchor, 30, new Date('2026-01-01T00:00:00Z')).toISOString()).toBe('2026-01-01T00:30:00.000Z');
    expect(nextDrawTime(anchor, 30, new Date('2026-01-01T01:05:00Z')).toISOString()).toBe('2026-01-01T01:30:00.000Z');
    expect(nextDrawTime(anchor, 30, new Date('2026-01-01T01:30:00Z')).toISOString()).toBe('2026-01-01T02:00:00.000Z'); // strictly after
  });
});

describe('draws.nextDrawFor (schedule kinds)', () => {
  it('run-once returns its moment; daily returns the next HH:MM in IST', () => {
    const once = new Date('2026-06-01T10:00:00Z');
    expect(nextDrawFor({ runOnceAt: once, dailyTime: null, drawIntervalMinutes: null }, once, new Date()).toISOString()).toBe(once.toISOString());
    // 15:00 IST == 09:30 UTC; after 09:31 UTC the next one is the following day
    const daily = { runOnceAt: null, dailyTime: '15:00', drawIntervalMinutes: null };
    expect(nextDrawFor(daily, new Date(), new Date('2026-03-10T09:00:00Z')).toISOString()).toBe('2026-03-10T09:30:00.000Z');
    expect(nextDrawFor(daily, new Date(), new Date('2026-03-10T09:31:00Z')).toISOString()).toBe('2026-03-11T09:30:00.000Z');
  });
});

describe('draws.salesWindow', () => {
  const cutoffSec = 30; // config.BUY_CUTOFF_SECONDS default
  it('no package window: open from creation until the cutoff before draw time', () => {
    const created = new Date('2026-01-01T00:00:00Z');
    const drawTime = new Date('2026-01-01T01:00:00Z');
    const w = salesWindow({ createdAt: created, drawTime }, { buyStartTime: null, buyEndTime: null, buyStartAt: null, buyEndAt: null });
    expect(w.restricted).toBe(false);
    expect(w.start).toEqual(created);
    expect(w.end.getTime()).toBe(drawTime.getTime() - cutoffSec * 1000);
  });
  it('daily window: returns the running window, end never past the cutoff', () => {
    // 09:00-21:00 IST == 03:30-15:30 UTC; "now" 10:00 UTC is inside
    const drawTime = new Date('2026-01-01T18:00:00Z');
    const w = salesWindow({ createdAt: new Date('2026-01-01T00:00:00Z'), drawTime },
      { buyStartTime: '09:00', buyEndTime: '21:00', buyStartAt: null, buyEndAt: null }, new Date('2026-01-01T10:00:00Z'));
    expect(w.restricted).toBe(true);
    expect(w.start.toISOString()).toBe('2026-01-01T03:30:00.000Z');
    expect(w.end.toISOString()).toBe('2026-01-01T15:30:00.000Z');
  });
  it('fixed dates: exactly that window, in the future too; end never past the cutoff', () => {
    const none = { buyStartTime: null, buyEndTime: null };
    const start = new Date('2026-01-05T04:30:00Z'), end = new Date('2026-01-06T12:30:00Z');
    const created = new Date('2026-01-01T00:00:00Z');
    const w = salesWindow({ createdAt: created, drawTime: new Date('2026-01-08T00:00:00Z') }, { ...none, buyStartAt: start, buyEndAt: end }, new Date('2026-01-01T10:00:00Z'));
    expect([w.restricted, w.start.toISOString(), w.end.toISOString()]).toEqual([true, start.toISOString(), end.toISOString()]);
    const early = salesWindow({ createdAt: created, drawTime: new Date('2026-01-06T00:00:00Z') }, { ...none, buyStartAt: start, buyEndAt: end });
    expect(early.end.getTime()).toBe(Date.parse('2026-01-06T00:00:00Z') - cutoffSec * 1000);
  });
});

describe('fair', () => {
  it('sha256 is stable and newSeed is 32 random bytes of hex', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(newSeed()).toMatch(/^[0-9a-f]{64}$/);
    expect(newSeed()).not.toBe(newSeed());
  });
});

describe('account.normalizeReferralCode', () => {
  it('trims and upper-cases', () => {
    expect(normalizeReferralCode('  ab12cd34 ')).toBe('AB12CD34');
  });
});
