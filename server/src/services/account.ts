import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { config } from '../config';
import { db } from '../db';
import { loginThrottle, referralTree, users, wallets } from '../db/schema';
import { AppError, accountBlocked } from '../lib/errors';
import { notify } from './notifications';
import { applyWallet } from './wallet';

// bcrypt adds a unique random salt per password and stores it inside the hash string.
export const hashPassword = (pw: string) => bcrypt.hash(pw, config.BCRYPT_ROUNDS);
// same cost as real hashes so login timing does not reveal whether a user id exists
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', config.BCRYPT_ROUNDS);

export const normalizeReferralCode = (code: string) => code.trim().toUpperCase();

export async function createUser(
  input: { username: string; name: string; password: string; phone?: string; role?: 'user' | 'admin'; referralCode?: string },
) {
  const passwordHash = await hashPassword(input.password);
  for (let attempt = 1; ; attempt++) {
    try {
      return await insertUser(input, passwordHash);
    } catch (e: any) {
      const err = e?.cause ?? e;
      // the generated referral code collided with an existing one (1 in ~4 billion): just try again
      if (err?.code === '23505' && String(err.constraint ?? '').includes('referral_code') && attempt < 3) continue;
      throw mapUserConflict(e);
    }
  }
}

async function insertUser(
  input: { username: string; name: string; phone?: string; role?: 'user' | 'admin'; referralCode?: string },
  passwordHash: string,
) {
  return db.transaction(async (tx) => {
    let referrer: { id: number; role: 'user' | 'admin' } | null = null;
    if (input.referralCode !== undefined) {
      const [r] = await tx.select({ id: users.id, role: users.role }).from(users).where(eq(users.referralCode, normalizeReferralCode(input.referralCode)));
      if (!r) throw new AppError(400, 'INVALID_REFERRAL', 'This referral code is not valid. Please check the link you were sent.');
      referrer = r;
    }
    const referrerId = referrer?.id ?? null;
    const [u] = await tx.insert(users).values({
      username: input.username, name: input.name, phone: input.phone ?? null, passwordHash, role: input.role ?? 'user', referredBy: referrerId,
    }).returning();
    if (referrerId !== null) {
      // the new user sits under the referrer and under every ancestor of the referrer, one level deeper
      const upline = await tx.select().from(referralTree).where(eq(referralTree.descendantId, referrerId));
      await tx.insert(referralTree).values([
        { ancestorId: referrerId, descendantId: u.id, depth: 1 },
        ...upline.map((r) => ({ ancestorId: r.ancestorId, descendantId: u.id, depth: r.depth + 1 })),
      ]);
    }
    await tx.insert(wallets).values({ userId: u.id, balance: 0 });
    // welcome bonus for the new player's own bonus wallet (players only, never the admin account)
    if (u.role === 'user' && config.WELCOME_BONUS > 0) {
      await applyWallet(tx, u.id, config.WELCOME_BONUS, 'signup_bonus');
      await notify(tx, u.id, {
        type: 'welcome_bonus', title: 'Welcome bonus',
        body: `₹${config.WELCOME_BONUS} welcome bonus added to your bonus wallet.`,
      });
    }
    // the player who shared the code earns the referral bonus (admins' codes earn nothing)
    if (referrer?.role === 'user' && config.REFERRAL_BONUS > 0) {
      await applyWallet(tx, referrer.id, config.REFERRAL_BONUS, 'referral_bonus', u.id);
      await notify(tx, referrer.id, {
        type: 'referral_bonus', title: 'Referral bonus',
        body: `₹${config.REFERRAL_BONUS} added to your bonus wallet: ${u.name} joined with your referral code.`,
      });
    }
    return u;
  });
}

/** Unique-constraint violations on signup become friendly 409s; anything else passes through. */
function mapUserConflict(e: any) {
  const err = e?.cause ?? e;
  if (err?.code !== '23505') return e;
  if (String(err.constraint ?? '').includes('phone')) return new AppError(409, 'PHONE_EXISTS', 'This mobile number is already registered. Please log in.');
  return new AppError(409, 'USERNAME_EXISTS', 'User ID already taken');
}

/** Signup with a mobile number (one account per number, no OTP), always under the referrer whose code was given. */
export async function registerUser(input: { username: string; name: string; password: string; phone: string; referralCode: string }) {
  return createUser(input);
}

const LOCK_MS = config.LOGIN_LOCK_MINUTES * 60_000;

/** Counts a failed attempt; the failure that reaches the limit locks the user ID for LOGIN_LOCK_MINUTES. */
async function recordFailure(username: string, now: Date) {
  const cutoff = new Date(now.getTime() - LOCK_MS).toISOString();
  const lockUntil = new Date(now.getTime() + LOCK_MS).toISOString();
  const nextFailures = sql`CASE WHEN ${loginThrottle.windowStart} < ${cutoff}::timestamptz THEN 1 ELSE ${loginThrottle.failures} + 1 END`;
  await db.insert(loginThrottle).values({ username, failures: 1, windowStart: now }).onConflictDoUpdate({
    target: loginThrottle.username,
    set: {
      failures: nextFailures,
      windowStart: sql`CASE WHEN ${loginThrottle.windowStart} < ${cutoff}::timestamptz THEN ${now.toISOString()}::timestamptz ELSE ${loginThrottle.windowStart} END`,
      lockedUntil: sql`CASE WHEN ${nextFailures} >= ${config.LOGIN_MAX_FAILURES} THEN ${lockUntil}::timestamptz ELSE ${loginThrottle.lockedUntil} END`,
    },
  });
}

export async function checkLogin(username: string, password: string, now = new Date()) {
  const [t] = await db.select().from(loginThrottle).where(eq(loginThrottle.username, username));
  if (t?.lockedUntil && t.lockedUntil > now) {
    throw new AppError(429, 'ACCOUNT_LOCKED', `Too many failed attempts. Try again in ${Math.ceil((t.lockedUntil.getTime() - now.getTime()) / 60_000)} minute(s).`);
  }
  const [u] = await db.select().from(users).where(eq(users.username, username));
  // compare even when user is missing to keep timing flat
  const ok = await bcrypt.compare(password, u?.passwordHash ?? DUMMY_HASH);
  if (!u || !ok) {
    await recordFailure(username, now);
    throw new AppError(401, 'BAD_CREDENTIALS', 'Wrong user ID or password');
  }
  if (t) await db.delete(loginThrottle).where(eq(loginThrottle.username, username));
  if (u.blockedAt) throw accountBlocked(); // only after the password check, so it never reveals which IDs exist
  return u;
}

export const publicUser = (u: typeof users.$inferSelect) => ({
  id: u.id, username: u.username, name: u.name, role: u.role, verified: false, referralCode: u.referralCode,
});
