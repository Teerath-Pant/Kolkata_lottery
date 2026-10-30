import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../db';
import { depositRequests, users } from '../db/schema';
import { AppError, notFound } from '../lib/errors';
import { audit } from './admin';
import { notify } from './notifications';
import { applyWallet } from './wallet';

/** Waiting requests per player, so the admin inbox cannot be flooded. */
export const DEPOSITS_PENDING_MAX = 3;

type Status = 'pending' | 'approved' | 'rejected';

export async function createDeposit(userId: number, input: { amount: number; utr?: string }) {
  const [{ n }] = await db.select({ n: count() }).from(depositRequests)
    .where(and(eq(depositRequests.userId, userId), eq(depositRequests.status, 'pending')));
  if (n >= DEPOSITS_PENDING_MAX) throw new AppError(429, 'TOO_MANY_DEPOSITS', `You already have ${n} requests waiting. Wait until the admin checks them.`);
  try {
    const [row] = await db.insert(depositRequests).values({ userId, amount: input.amount, utr: input.utr ?? null }).returning();
    return row;
  } catch (e: any) {
    if ((e?.cause ?? e)?.code === '23505') throw new AppError(409, 'UTR_USED', 'This UTR / transaction ID was already sent');
    throw e;
  }
}

export const listMyDeposits = (userId: number, limit = 20) =>
  db.select({
    id: depositRequests.id, amount: depositRequests.amount, utr: depositRequests.utr, status: depositRequests.status,
    createdAt: depositRequests.createdAt, reviewedAt: depositRequests.reviewedAt,
  }).from(depositRequests).where(eq(depositRequests.userId, userId)).orderBy(desc(depositRequests.id)).limit(limit);

const reviewer = alias(users, 'reviewer');

/**
 * One page (1-based) of requests. 'history' = approved + rejected, newest decision first; anything else newest request first.
 * Also the count per status (tab badges) and the total amount approved so far.
 */
export async function listDeposits(opts: { status?: Status | 'history'; page?: number; pageSize?: number } = {}) {
  const page = opts.page ?? 1, pageSize = opts.pageSize ?? 25;
  const filter = opts.status === 'history' ? inArray(depositRequests.status, ['approved', 'rejected'])
    : opts.status ? eq(depositRequests.status, opts.status) : undefined;
  const decided = opts.status === 'history' || opts.status === 'approved' || opts.status === 'rejected';
  const [{ total }] = await db.select({ total: count() }).from(depositRequests).where(filter);
  const byStatus = await db.select({ status: depositRequests.status, n: count(), amount: sql<number>`COALESCE(sum(${depositRequests.amount}), 0)::float8` })
    .from(depositRequests).groupBy(depositRequests.status);
  const of = (s: Status) => byStatus.find((r) => r.status === s);
  const rows = await db.select({
    id: depositRequests.id, userId: depositRequests.userId, amount: depositRequests.amount, utr: depositRequests.utr,
    status: depositRequests.status, createdAt: depositRequests.createdAt, reviewedAt: depositRequests.reviewedAt,
    name: users.name, username: users.username, reviewedByName: reviewer.name,
  }).from(depositRequests)
    .innerJoin(users, eq(users.id, depositRequests.userId))
    .leftJoin(reviewer, eq(reviewer.id, depositRequests.reviewedBy))
    .where(filter)
    .orderBy(...(decided ? [desc(depositRequests.reviewedAt), desc(depositRequests.id)] : [desc(depositRequests.id)]))
    .limit(pageSize).offset((page - 1) * pageSize);
  return {
    deposits: rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)),
    pending: of('pending')?.n ?? 0,
    counts: { pending: of('pending')?.n ?? 0, approved: of('approved')?.n ?? 0, rejected: of('rejected')?.n ?? 0 },
    approvedTotal: of('approved')?.amount ?? 0,
  };
}

/** Approve credits the wallet once (row lock + pending check); reject credits nothing. A decided request is final. */
export async function reviewDeposit(adminId: number, id: number, status: 'approved' | 'rejected', ip?: string) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(depositRequests).where(eq(depositRequests.id, id)).for('update');
    if (!before) throw notFound('Deposit request');
    if (before.status !== 'pending') throw new AppError(409, 'ALREADY_REVIEWED', `Request already ${before.status}`);
    const [row] = await tx.update(depositRequests)
      .set({ status, reviewedAt: sql`now()`, reviewedBy: adminId })
      .where(eq(depositRequests.id, id)).returning();
    const balance = status === 'approved' ? await applyWallet(tx, before.userId, before.amount, 'deposit', id) : undefined;
    await notify(tx, before.userId, status === 'approved'
      ? { type: 'deposit_approved', title: 'Money added', body: `₹${before.amount} has been added to your wallet.` }
      : { type: 'deposit_rejected', title: 'Request rejected', body: `Your add money request of ₹${before.amount} was rejected.` });
    await audit(tx, adminId, status === 'approved' ? 'deposit_approve' : 'deposit_reject', null, { depositId: id, userId: before.userId, amount: before.amount, utr: before.utr, balance }, ip);
    return row;
  });
}
