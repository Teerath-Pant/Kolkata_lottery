import { desc, eq, sql } from 'drizzle-orm';
import { Exec, Tx, db } from '../db';
import { walletLedger, wallets } from '../db/schema';
import { AppError } from '../lib/errors';

/** Far below 2^53, so balances and ledger sums stay exact as JS numbers. */
export const MAX_BALANCE = 1_000_000_000_000;

type LedgerType = typeof walletLedger.$inferInsert['type'];

/** Credits of these types land in the bonus wallet. signup_bonus = the welcome bonus; daily_claim: old rows from a feature since removed. */
export const BONUS_TYPES: LedgerType[] = ['referral_bonus', 'bulk_bonus', 'signup_bonus', 'daily_claim'];

export const lockWallet = async (tx: Tx, userId: number) => {
  const [w] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).for('update');
  if (!w) throw new AppError(404, 'NOT_FOUND', 'Wallet not found');
  return w;
};

export type WalletPart = 'purchase' | 'bonus' | 'income';
export type Split = Record<WalletPart, number>;
const COL = { purchase: 'purchaseBalance', bonus: 'bonusBalance', income: 'incomeBalance' } as const;
/** Tickets and admin debits spend money added first; a withdrawal pays out winnings first. */
export const SPEND_ORDER: WalletPart[] = ['purchase', 'bonus', 'income'];
export const WITHDRAW_ORDER: WalletPart[] = ['income', 'purchase', 'bonus'];

/**
 * Single entry point for every balance change: locks the row, updates balance, writes ledger.
 * The total (balance) is the sum of three wallets. A credit lands in `into` when given (giving back exactly what a debit took),
 * otherwise prizes go to the income wallet, bonuses (BONUS_TYPES) to the bonus wallet and everything else to the purchase wallet.
 * A debit takes from the wallets in `order` (SPEND_ORDER unless given). Returns the new total and what each wallet gained (+) or lost (-).
 */
export async function moveWallet(tx: Tx, userId: number, amount: number, type: LedgerType,
  opts: { refId?: number | null; note?: string; order?: WalletPart[]; into?: Split } = {}) {
  const w = await lockWallet(tx, userId);
  const balanceAfter = w.balance + amount;
  if (balanceAfter < 0) throw new AppError(402, 'INSUFFICIENT_COINS', 'Not enough coins');
  if (balanceAfter > MAX_BALANCE) throw new AppError(400, 'BALANCE_LIMIT', 'Wallet balance limit exceeded');
  const split: Split = { purchase: 0, bonus: 0, income: 0 };
  if (amount > 0 && opts.into) {
    if (opts.into.purchase + opts.into.bonus + opts.into.income !== amount) throw new Error('wallet split does not add up to the amount');
    Object.assign(split, opts.into);
  } else if (amount > 0) {
    split[type === 'prize' ? 'income' : BONUS_TYPES.includes(type) ? 'bonus' : 'purchase'] = amount;
  } else {
    let due = -amount; // fully covered: balanceAfter >= 0 was checked above
    for (const part of opts.order ?? SPEND_ORDER) {
      const take = Math.min(w[COL[part]], due);
      split[part] = -take;
      due -= take;
    }
  }
  await tx.update(wallets).set({
    balance: balanceAfter, purchaseBalance: w.purchaseBalance + split.purchase, incomeBalance: w.incomeBalance + split.income,
    bonusBalance: w.bonusBalance + split.bonus, updatedAt: new Date(),
  }).where(eq(wallets.userId, userId));
  await tx.insert(walletLedger).values({ userId, amount, type, refId: opts.refId ?? null, note: opts.note || null, balanceAfter });
  return { balanceAfter, split };
}

/** moveWallet with the default wallet routing; returns the new total. */
export const applyWallet = async (tx: Tx, userId: number, amount: number, type: LedgerType, refId?: number | null, note?: string) =>
  (await moveWallet(tx, userId, amount, type, { refId, note })).balanceAfter;

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
    purchaseBalance: w.purchaseBalance,
    bonusBalance: w.bonusBalance,
    incomeBalance: w.incomeBalance,
    deposit: sum('deposit'),
    winnings: sum('prize'),
    bonus: sum(...BONUS_TYPES),
    recent,
  };
}
