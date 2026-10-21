import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { config } from '../config';
import { db } from '../db';
import { users, wallets } from '../db/schema';
import { AppError } from '../lib/errors';
import { applyWallet } from './wallet';

// bcrypt adds a unique random salt per password and stores it inside the hash string.
export const hashPassword = (pw: string) => bcrypt.hash(pw, config.BCRYPT_ROUNDS);
// same cost as real hashes so login timing does not reveal whether a mobile number exists
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', config.BCRYPT_ROUNDS);

export async function createUser(input: { mobile: string; name: string; password: string; role?: 'user' | 'admin' }, bonus = config.SIGNUP_BONUS) {
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.transaction(async (tx) => {
      const [u] = await tx.insert(users).values({
        mobile: input.mobile, name: input.name, passwordHash, role: input.role ?? 'user',
      }).returning();
      await tx.insert(wallets).values({ userId: u.id, balance: 0 });
      if (bonus > 0) await applyWallet(tx, u.id, bonus, 'signup_bonus');
      return u;
    });
  } catch (e: any) {
    if (e?.code === '23505' || e?.cause?.code === '23505') throw new AppError(409, 'MOBILE_EXISTS', 'Mobile number already registered');
    throw e;
  }
}

export async function checkLogin(mobile: string, password: string) {
  const [u] = await db.select().from(users).where(eq(users.mobile, mobile));
  // compare even when user is missing to keep timing flat
  const ok = await bcrypt.compare(password, u?.passwordHash ?? DUMMY_HASH);
  if (!u || !ok) throw new AppError(401, 'BAD_CREDENTIALS', 'Wrong mobile number or password');
  return u;
}

export const publicUser = (u: typeof users.$inferSelect) => ({ id: u.id, mobile: u.mobile, name: u.name, role: u.role });
