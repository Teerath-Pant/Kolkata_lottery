import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { draws, packages, tickets, users } from '../db/schema';
import { computePrize, salesWindow } from './draws';

/**
 * Admin's live view: every draw that is running (open = selling, drawing = sales closed, waiting for the result), cheapest
 * package first, and the tickets sold in one of them, newest first, with who bought each.
 * Search: ticket number (leading digits), buyer name, user ID or the exact member ID.
 */
export async function liveTickets(opts: { drawId?: number; search?: string; page?: number; pageSize?: number } = {}, now = new Date()) {
  const page = opts.page ?? 1, pageSize = opts.pageSize ?? 48;
  const rows = await db.select({ d: draws, p: { buyStartTime: packages.buyStartTime, buyEndTime: packages.buyEndTime, buyStartAt: packages.buyStartAt, buyEndAt: packages.buyEndAt } }).from(draws)
    .innerJoin(packages, eq(packages.id, draws.packageId))
    .where(inArray(draws.status, ['open', 'drawing'])).orderBy(asc(draws.ticketPrice), asc(draws.drawTime));
  const ids = rows.map((r) => r.d.id);
  const counts = ids.length
    ? await db.select({ drawId: tickets.drawId, n: sql<number>`count(*)::int`, buyers: sql<number>`count(DISTINCT ${tickets.userId})::int`, last: sql<Date | null>`max(${tickets.createdAt})` })
      .from(tickets).where(inArray(tickets.drawId, ids)).groupBy(tickets.drawId)
    : [];

  const list = rows.map(({ d, p }) => {
    const c = counts.find((x) => x.drawId === d.id);
    const sold = c?.n ?? 0;
    const sales = salesWindow(d, p, now);
    return {
      id: d.id, packageId: d.packageId, packageName: d.packageName, theme: d.theme, status: d.status as 'open' | 'drawing',
      drawTime: d.drawTime, salesEnd: sales.end,
      selling: d.status === 'open' && now.getTime() >= sales.start.getTime() && now.getTime() < sales.end.getTime(),
      ticketPrice: d.ticketPrice, maxTickets: d.maxTickets, sold, buyers: c?.buyers ?? 0, takings: sold * d.ticketPrice,
      prize: computePrize(d, sold), lastSaleAt: c?.last ?? null,
    };
  });

  const selected = list.find((d) => d.id === opts.drawId) ?? list[0] ?? null;
  const text = opts.search?.trim();
  let rowsOut: { id: number; ticketNo: number; userId: number; name: string; username: string; createdAt: Date }[] = [];
  let total = 0;
  if (selected) {
    const pat = text ? `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
    const where = and(
      eq(tickets.drawId, selected.id),
      pat ? or(
        /^\d{1,6}$/.test(text!) ? sql`${tickets.ticketNo}::text LIKE ${`${text}%`}` : undefined,
        ilike(users.name, pat), ilike(users.username, pat),
        /^[1-9]\d{0,8}$/.test(text!) ? eq(users.id, Number(text)) : undefined,
      ) : undefined,
    );
    rowsOut = await db.select({
      id: tickets.id, ticketNo: tickets.ticketNo, userId: users.id, name: users.name, username: users.username, createdAt: tickets.createdAt,
    }).from(tickets).innerJoin(users, eq(users.id, tickets.userId)).where(where)
      .orderBy(desc(tickets.createdAt), desc(tickets.id)).limit(pageSize).offset((page - 1) * pageSize);
    [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(tickets).innerJoin(users, eq(users.id, tickets.userId)).where(where);
  }
  return {
    serverTime: now.toISOString(), draws: list, selectedId: selected?.id ?? null,
    tickets: rowsOut, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
