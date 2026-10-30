import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { Exec, db } from '../db';
import { notifications } from '../db/schema';

/** Call inside the transaction of the event, so the message exists only if the event happened. */
export const notify = (exec: Exec, userId: number, n: { type: string; title: string; body: string }) =>
  exec.insert(notifications).values({ userId, ...n });

export async function listNotifications(userId: number, limit = 50) {
  const rows = await db.select({
    id: notifications.id, type: notifications.type, title: notifications.title, body: notifications.body,
    readAt: notifications.readAt, createdAt: notifications.createdAt,
  }).from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.id)).limit(limit);
  const [{ unread }] = await db.select({ unread: sql<number>`count(*)::int` }).from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return { notifications: rows, unread };
}

export const markAllRead = (userId: number) =>
  db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
