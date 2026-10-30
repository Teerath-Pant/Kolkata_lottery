import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { config } from '../config';
import { db } from '../db';
import { users, wallets, withdrawalRequests } from '../db/schema';
import { AppError, notFound } from '../lib/errors';
import { audit } from './admin';
import { notify } from './notifications';
import { WITHDRAW_ORDER, moveWallet } from './wallet';

type Status = 'pending' | 'approved' | 'rejected';

const mine = {
  id: withdrawalRequests.id, amount: withdrawalRequests.amount, upiId: withdrawalRequests.upiId, holderName: withdrawalRequests.holderName,
  status: withdrawalRequests.status, payoutRef: withdrawalRequests.payoutRef, note: withdrawalRequests.note,
  createdAt: withdrawalRequests.createdAt, reviewedAt: withdrawalRequests.reviewedAt,
};

/** What the withdraw screen needs: what can be asked for, the open request, and the payout details used last time. */
export async function withdrawInfo(userId: number) {
  const [w] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  const [last] = await db.select({ upiId: withdrawalRequests.upiId, holderName: withdrawalRequests.holderName })
    .from(withdrawalRequests).where(eq(withdrawalRequests.userId, userId)).orderBy(desc(withdrawalRequests.id)).limit(1);
  const [pending] = await db.select(mine).from(withdrawalRequests)
    .where(and(eq(withdrawalRequests.userId, userId), eq(withdrawalRequests.status, 'pending')));
  const [paid] = await db.select({ n: count(), amount: sql<number>`COALESCE(sum(${withdrawalRequests.amount}), 0)::float8` })
    .from(withdrawalRequests).where(and(eq(withdrawalRequests.userId, userId), eq(withdrawalRequests.status, 'approved')));
  return {
    min: config.WITHDRAW_MIN,
    balance: w?.balance ?? 0, incomeBalance: w?.incomeBalance ?? 0, purchaseBalance: w?.purchaseBalance ?? 0, bonusBalance: w?.bonusBalance ?? 0,
    order: WITHDRAW_ORDER,
    lastPayout: last ?? null, pending: pending ?? null,
    withdrawn: paid.amount, withdrawals: paid.n,
  };
}

/** Nothing is taken from the wallet yet; only one request may wait at a time. */
export async function createWithdrawal(userId: number, input: { amount: number; upiId: string; holderName: string }) {
  if (input.amount < config.WITHDRAW_MIN) throw new AppError(400, 'WITHDRAW_MIN', `The smallest withdrawal is ₹${config.WITHDRAW_MIN}`);
  return db.transaction(async (tx) => {
    const [w] = await tx.select({ balance: wallets.balance }).from(wallets).where(eq(wallets.userId, userId));
    if (!w || w.balance < input.amount) throw new AppError(402, 'INSUFFICIENT_COINS', `You can withdraw up to ₹${w?.balance ?? 0}`);
    try {
      const [row] = await tx.insert(withdrawalRequests).values({ userId, ...input }).returning();
      return row;
    } catch (e: any) {
      if ((e?.cause ?? e)?.code === '23505') throw new AppError(409, 'WITHDRAWAL_PENDING', 'You already have a withdrawal waiting. Wait until the admin checks it.');
      throw e;
    }
  });
}

export const listMyWithdrawals = (userId: number, limit = 20) =>
  db.select(mine).from(withdrawalRequests).where(eq(withdrawalRequests.userId, userId)).orderBy(desc(withdrawalRequests.id)).limit(limit);

const reviewer = alias(users, 'reviewer');

/**
 * One page (1-based) of requests, like the add-money inbox. 'history' = approved + rejected, newest decision first.
 * Each row carries the player's balance right now, so the admin sees whether an approve can go through.
 */
export async function listWithdrawals(opts: { status?: Status | 'history'; page?: number; pageSize?: number } = {}) {
  const page = opts.page ?? 1, pageSize = opts.pageSize ?? 25;
  const filter = opts.status === 'history' ? inArray(withdrawalRequests.status, ['approved', 'rejected'])
    : opts.status ? eq(withdrawalRequests.status, opts.status) : undefined;
  const decided = opts.status === 'history' || opts.status === 'approved' || opts.status === 'rejected';
  const [{ total }] = await db.select({ total: count() }).from(withdrawalRequests).where(filter);
  const byStatus = await db.select({ status: withdrawalRequests.status, n: count(), amount: sql<number>`COALESCE(sum(${withdrawalRequests.amount}), 0)::float8` })
    .from(withdrawalRequests).groupBy(withdrawalRequests.status);
  const of = (s: Status) => byStatus.find((r) => r.status === s);
  const rows = await db.select({
    ...mine, userId: withdrawalRequests.userId,
    fromIncome: withdrawalRequests.fromIncome, fromPurchase: withdrawalRequests.fromPurchase, fromBonus: withdrawalRequests.fromBonus,
    name: users.name, username: users.username, blockedAt: users.blockedAt, reviewedByName: reviewer.name,
    balance: wallets.balance, incomeBalance: wallets.incomeBalance,
  }).from(withdrawalRequests)
    .innerJoin(users, eq(users.id, withdrawalRequests.userId))
    .leftJoin(wallets, eq(wallets.userId, withdrawalRequests.userId))
    .leftJoin(reviewer, eq(reviewer.id, withdrawalRequests.reviewedBy))
    .where(filter)
    .orderBy(...(decided ? [desc(withdrawalRequests.reviewedAt), desc(withdrawalRequests.id)] : [desc(withdrawalRequests.id)]))
    .limit(pageSize).offset((page - 1) * pageSize);
  return {
    withdrawals: rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)),
    counts: { pending: of('pending')?.n ?? 0, approved: of('approved')?.n ?? 0, rejected: of('rejected')?.n ?? 0 },
    pendingTotal: of('pending')?.amount ?? 0, approvedTotal: of('approved')?.amount ?? 0,
  };
}

/**
 * Approve takes the amount out of the wallets now, income wallet first (refused if the player no longer has it).
 * Reject takes nothing. A decided request is final.
 */
export async function reviewWithdrawal(adminId: number, id: number, status: 'approved' | 'rejected', input: { payoutRef?: string; note?: string }, ip?: string) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(withdrawalRequests).where(eq(withdrawalRequests.id, id)).for('update');
    if (!before) throw notFound('Withdrawal request');
    if (before.status !== 'pending') throw new AppError(409, 'ALREADY_REVIEWED', `Request already ${before.status}`);
    let split = { income: 0, purchase: 0, bonus: 0 }, balance: number | undefined;
    if (status === 'approved') {
      try {
        ({ split, balanceAfter: balance } = await moveWallet(tx, before.userId, -before.amount, 'withdrawal', { refId: id, order: WITHDRAW_ORDER }));
      } catch (e) {
        if (!(e instanceof AppError) || e.code !== 'INSUFFICIENT_COINS') throw e;
        const [w] = await tx.select({ balance: wallets.balance }).from(wallets).where(eq(wallets.userId, before.userId));
        throw new AppError(402, 'INSUFFICIENT_COINS', `The player has only ₹${w?.balance ?? 0} now, less than the ₹${before.amount} asked. Reject this request instead.`);
      }
    }
    const [row] = await tx.update(withdrawalRequests).set({
      status, reviewedAt: sql`now()`, reviewedBy: adminId,
      payoutRef: status === 'approved' ? input.payoutRef || null : null, note: status === 'rejected' ? input.note || null : null,
      fromIncome: -split.income, fromPurchase: -split.purchase, fromBonus: -split.bonus,
    }).where(eq(withdrawalRequests.id, id)).returning();
    await notify(tx, before.userId, status === 'approved'
      ? { type: 'withdrawal_approved', title: 'Withdrawal approved', body: `₹${before.amount} is being sent to ${before.upiId}${input.payoutRef ? ` (ref ${input.payoutRef})` : ''}.` }
      : { type: 'withdrawal_rejected', title: 'Withdrawal rejected', body: `Your withdrawal of ₹${before.amount} was rejected${input.note ? `: ${input.note}` : ''}. Nothing was taken from your wallet.` });
    await audit(tx, adminId, status === 'approved' ? 'withdraw_approve' : 'withdraw_reject', null, {
      withdrawalId: id, userId: before.userId, amount: before.amount, upiId: before.upiId, balance, ...input,
    }, ip);
    return row;
  });
}
