import { and, count, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db';
import { complaints, users } from '../db/schema';
import { AppError, notFound } from '../lib/errors';
import { audit } from './admin';

/** Per player per 24h, so the admin inbox cannot be flooded. */
export const COMPLAINTS_PER_DAY = 5;

export async function createComplaint(userId: number, input: { subject: string; message: string }) {
  const since = new Date(Date.now() - 86_400_000);
  const [{ n }] = await db.select({ n: count() }).from(complaints)
    .where(and(eq(complaints.userId, userId), gte(complaints.createdAt, since)));
  if (n >= COMPLAINTS_PER_DAY) throw new AppError(429, 'TOO_MANY_COMPLAINTS', `You can send ${COMPLAINTS_PER_DAY} complaints per day. Try again tomorrow.`);
  const [row] = await db.insert(complaints).values({ userId, ...input }).returning();
  return row;
}

export const listMyComplaints = (userId: number, limit = 50) =>
  db.select({
    id: complaints.id, subject: complaints.subject, message: complaints.message, status: complaints.status,
    createdAt: complaints.createdAt, resolvedAt: complaints.resolvedAt,
  }).from(complaints).where(eq(complaints.userId, userId)).orderBy(desc(complaints.id)).limit(limit);

/** Newest first, one page at a time (page is 1-based), with the open count for the badge. */
export async function listComplaints(opts: { status?: 'open' | 'resolved'; page?: number; pageSize?: number } = {}) {
  const page = opts.page ?? 1, pageSize = opts.pageSize ?? 25;
  const filter = opts.status ? eq(complaints.status, opts.status) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(complaints).where(filter);
  const [{ open }] = await db.select({ open: count() }).from(complaints).where(eq(complaints.status, 'open'));
  const rows = await db.select({
    id: complaints.id, userId: complaints.userId, subject: complaints.subject, message: complaints.message, status: complaints.status,
    createdAt: complaints.createdAt, resolvedAt: complaints.resolvedAt, name: users.name, username: users.username,
  }).from(complaints).innerJoin(users, eq(users.id, complaints.userId)).where(filter)
    .orderBy(desc(complaints.id)).limit(pageSize).offset((page - 1) * pageSize);
  return { complaints: rows, total, open, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function setComplaintStatus(adminId: number, id: number, status: 'open' | 'resolved', ip?: string) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(complaints).where(eq(complaints.id, id)).for('update');
    if (!before) throw notFound('Complaint');
    if (before.status === status) return before;
    const [row] = await tx.update(complaints)
      .set({ status, resolvedAt: status === 'resolved' ? sql`now()` : null })
      .where(eq(complaints.id, id)).returning();
    await audit(tx, adminId, status === 'resolved' ? 'complaint_resolve' : 'complaint_reopen', null, { complaintId: id, userId: before.userId, subject: before.subject }, ip);
    return row;
  });
}
