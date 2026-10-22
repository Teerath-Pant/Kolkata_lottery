import { desc, eq, sql } from 'drizzle-orm';
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
  return {
    balance: w.balance,
    winnings: sum('prize'),
    bonus: sum('signup_bonus', 'daily_claim'), // daily_claim: old rows from before the feature was removed
    recent,
  };
}
