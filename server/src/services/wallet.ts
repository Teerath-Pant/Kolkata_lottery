import { desc, eq, sql } from 'drizzle-orm';
import { config } from '../config';
import { Exec, Tx, db } from '../db';
import { walletLedger, wallets } from '../db/schema';
import { AppError } from '../lib/errors';

type LedgerType = typeof walletLedger.$inferInsert['type'];

export const lockWallet = async (tx: Tx, userId: number) => {
  const [w] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).for('update');
  if (!w) throw new AppError(404, 'NOT_FOUND', 'Wallet not found');
  return w;
};

/** Single entry point for every balance change: locks the row, updates balance, writes ledger. */
export async function applyWallet(tx: Tx, userId: number, amount: number, type: LedgerType, refId?: number | null) {
  const w = await lockWallet(tx, userId);
  const balanceAfter = w.balance + amount;
  if (balanceAfter < 0) throw new AppError(402, 'INSUFFICIENT_COINS', 'Not enough coins');
  await tx.update(wallets).set({ balance: balanceAfter, updatedAt: new Date() }).where(eq(wallets.userId, userId));
  await tx.insert(walletLedger).values({ userId, amount, type, refId: refId ?? null, balanceAfter });
  return balanceAfter;
}

const DAY_MS = 24 * 3600 * 1000;

export async function dailyClaim(userId: number, now = new Date()) {
  return db.transaction(async (tx) => {
    await lockWallet(tx, userId);
    const [last] = await tx.select({ at: walletLedger.createdAt }).from(walletLedger)
      .where(sql`${walletLedger.userId} = ${userId} AND ${walletLedger.type} = 'daily_claim'`)
      .orderBy(desc(walletLedger.createdAt)).limit(1);
    if (last && now.getTime() - last.at.getTime() < DAY_MS) {
      throw new AppError(429, 'CLAIM_TOO_SOON', `Next claim at ${new Date(last.at.getTime() + DAY_MS).toISOString()}`);
    }
    const balance = await applyWallet(tx, userId, config.DAILY_CLAIM_AMOUNT, 'daily_claim');
    return { balance, claimed: config.DAILY_CLAIM_AMOUNT, nextClaimAt: new Date(now.getTime() + DAY_MS).toISOString() };
  });
}

export async function walletSummary(userId: number, exec: Exec = db) {
  const [w] = await exec.select().from(wallets).where(eq(wallets.userId, userId));
  if (!w) throw new AppError(404, 'NOT_FOUND', 'Wallet not found');
  const sums = await exec.select({
    type: walletLedger.type,
    total: sql<number>`COALESCE(SUM(${walletLedger.amount}),0)::float8`,
  }).from(walletLedger).where(eq(walletLedger.userId, userId)).groupBy(walletLedger.type);
  const sum = (...t: string[]) => sums.filter((s) => t.includes(s.type)).reduce((a, s) => a + s.total, 0);
  const recent = await exec.select().from(walletLedger).where(eq(walletLedger.userId, userId))
    .orderBy(desc(walletLedger.createdAt), desc(walletLedger.id)).limit(50);
  const [last] = await exec.select({ at: walletLedger.createdAt }).from(walletLedger)
    .where(sql`${walletLedger.userId} = ${userId} AND ${walletLedger.type} = 'daily_claim'`)
    .orderBy(desc(walletLedger.createdAt)).limit(1);
  const nextClaimAt = last ? new Date(last.at.getTime() + DAY_MS) : null;
  return {
    balance: w.balance,
    winnings: sum('prize'),
    bonus: sum('signup_bonus', 'daily_claim'),
    dailyClaimAmount: config.DAILY_CLAIM_AMOUNT,
    canClaim: !nextClaimAt || nextClaimAt.getTime() <= Date.now(),
    nextClaimAt: nextClaimAt?.toISOString() ?? null,
    recent,
  };
}
