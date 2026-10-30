import { and, count, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db';
import { complaintImages, complaints, users } from '../db/schema';
import { AppError, notFound } from '../lib/errors';
import { audit } from './admin';

/** Per player per 24h, so the admin inbox cannot be flooded. */
export const COMPLAINTS_PER_DAY = 5;
export const MAX_IMAGES = 3;
export const IMAGE_MAX_BYTES = 700_000; // per picture; the apps shrink photos to about 300 KB before sending

// "complaints"."id" is written out: drizzle drops the table name in single-table selects, which would bind to complaint_images.id
const imageCount = sql<number>`(SELECT count(*)::int FROM complaint_images ci WHERE ci.complaint_id = "complaints"."id")`;

/** "data:image/jpeg;base64,..." -> checked mime + base64. Type comes from the file's own bytes, never from the header text. */
export function parseImage(dataUrl: string) {
  const m = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  const bytes = m ? Buffer.from(m[1], 'base64') : null;
  if (!bytes || bytes.length > IMAGE_MAX_BYTES) throw new AppError(400, 'BAD_IMAGE', 'Each image must be a JPEG, PNG or WebP under 700 KB');
  const mime = bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? 'image/jpeg'
    : bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) ? 'image/png'
    : bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP' ? 'image/webp' : null;
  if (!mime) throw new AppError(400, 'BAD_IMAGE', 'Each image must be a JPEG, PNG or WebP under 700 KB');
  return { mime, data: m![1] };
}

export async function createComplaint(userId: number, input: { subject: string; message: string; images?: string[] }) {
  const since = new Date(Date.now() - 86_400_000);
  const [{ n }] = await db.select({ n: count() }).from(complaints)
    .where(and(eq(complaints.userId, userId), gte(complaints.createdAt, since)));
  if (n >= COMPLAINTS_PER_DAY) throw new AppError(429, 'TOO_MANY_COMPLAINTS', `You can send ${COMPLAINTS_PER_DAY} complaints per day. Try again tomorrow.`);
  const images = (input.images ?? []).map(parseImage);
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(complaints).values({ userId, subject: input.subject, message: input.message }).returning();
    if (images.length) await tx.insert(complaintImages).values(images.map((img) => ({ complaintId: row.id, ...img })));
    return { ...row, imageCount: images.length };
  });
}

export const listMyComplaints = (userId: number, limit = 50) =>
  db.select({
    id: complaints.id, subject: complaints.subject, message: complaints.message, status: complaints.status,
    createdAt: complaints.createdAt, resolvedAt: complaints.resolvedAt, imageCount,
  }).from(complaints).where(eq(complaints.userId, userId)).orderBy(desc(complaints.id)).limit(limit);

/** Newest first, one page at a time (page is 1-based), with the open count for the badge. */
export async function listComplaints(opts: { status?: 'open' | 'resolved'; page?: number; pageSize?: number } = {}) {
  const page = opts.page ?? 1, pageSize = opts.pageSize ?? 25;
  const filter = opts.status ? eq(complaints.status, opts.status) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(complaints).where(filter);
  const [{ open }] = await db.select({ open: count() }).from(complaints).where(eq(complaints.status, 'open'));
  const rows = await db.select({
    id: complaints.id, userId: complaints.userId, subject: complaints.subject, message: complaints.message, status: complaints.status,
    createdAt: complaints.createdAt, resolvedAt: complaints.resolvedAt, name: users.name, username: users.username, imageCount,
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

/** The pictures as data URLs, in the order sent, for the admin viewer. */
export async function getComplaintImages(id: number) {
  const rows = await db.select().from(complaintImages).where(eq(complaintImages.complaintId, id)).orderBy(complaintImages.id);
  if (!rows.length) throw notFound('Images');
  return { images: rows.map((r) => `data:${r.mime};base64,${r.data}`) };
}
