import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { config } from '../config';
import { db } from '../db';
import { loginThrottle, users, wallets } from '../db/schema';
import { AppError } from '../lib/errors';
import { applyWallet } from './wallet';

// bcrypt adds a unique random salt per password and stores it inside the hash string.
export const hashPassword = (pw: string) => bcrypt.hash(pw, config.BCRYPT_ROUNDS);
// same cost as real hashes so login timing does not reveal whether a user id exists
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', config.BCRYPT_ROUNDS);

export async function createUser(
  input: { username: string; name: string; password: string; phone?: string; role?: 'user' | 'admin' },
  bonus = config.SIGNUP_BONUS,
) {
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.transaction(async (tx) => {
      const [u] = await tx.insert(users).values({
        username: input.username, name: input.name, phone: input.phone ?? null, passwordHash, role: input.role ?? 'user',
      }).returning();
      await tx.insert(wallets).values({ userId: u.id, balance: 0 });
      if (bonus > 0) await applyWallet(tx, u.id, bonus, 'signup_bonus');
      return u;
    });
  } catch (e: any) {
    const err = e?.cause ?? e;
    if (err?.code === '23505') {
      if (String(err.constraint ?? '').includes('phone')) throw new AppError(409, 'PHONE_EXISTS', 'This mobile number is already registered. Please log in.');
      throw new AppError(409, 'USERNAME_EXISTS', 'User ID already taken');
    }
    throw e;
  }
}

/** Signup with a mobile number (one account per number, no OTP). */
export async function registerUser(input: { username: string; name: string; password: string; phone: string }) {
  return createUser(input, config.SIGNUP_BONUS);
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
  return u;
}

export const publicUser = (u: typeof users.$inferSelect) => ({ id: u.id, username: u.username, name: u.name, role: u.role, verified: false });
