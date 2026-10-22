import { and, desc, eq, sql } from 'drizzle-orm';
import { Exec, Tx, db } from '../db';
import { adminAuditLog, draws, packages, tickets, users, wallets } from '../db/schema';
import { AppError, notFound } from '../lib/errors';
import { TICKET_MAX, TICKET_MIN, nextDrawTime, openDraw } from './draws';
import { applyWallet } from './wallet';

export const audit = (exec: Exec, adminId: number, action: string, drawId: number | null, payload: unknown, ip?: string) =>
  exec.insert(adminAuditLog).values({ adminId, action, drawId, payload: payload as any, ip: ip ?? null });

type PkgInput = Omit<typeof packages.$inferInsert, 'id'>;

export async function createPackage(adminId: number, input: PkgInput, ip?: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const [pkg] = await tx.insert(packages).values(input).returning();
    if (pkg.isActive) await openDraw(tx, pkg, nextDrawTime(now, pkg.drawIntervalMinutes, now));
    await audit(tx, adminId, 'package_create', null, pkg, ip);
    return pkg;
  });
}

export async function updatePackage(adminId: number, id: number, patch: Partial<PkgInput>, ip?: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(packages).where(eq(packages.id, id)).for('update');
    if (!before) throw notFound('Package');
    const [pkg] = await tx.update(packages).set(patch).where(eq(packages.id, id)).returning();
    // re-activated package with no open draw gets one
    const [open] = await tx.select({ id: draws.id }).from(draws).where(and(eq(draws.packageId, id), eq(draws.status, 'open')));
    if (pkg.isActive && !open) await openDraw(tx, pkg, nextDrawTime(now, pkg.drawIntervalMinutes, now));
    await audit(tx, adminId, 'package_update', null, { before, patch }, ip);
    return pkg;
  });
}

/** Mode / winner can change only while the draw is open and before draw_time. */
async function lockEditableDraw(tx: Tx, drawId: number, now: Date) {
  const [d] = await tx.select().from(draws).where(eq(draws.id, drawId)).for('update');
  if (!d) throw notFound('Draw');
  if (d.status !== 'open' || now.getTime() >= d.drawTime.getTime()) {
    throw new AppError(400, 'DRAW_LOCKED', 'Draw can only be edited while open and before draw time');
  }
  return d;
}

export async function setMode(adminId: number, drawId: number, mode: 'random' | 'admin_selected', ip?: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const d = await lockEditableDraw(tx, drawId, now);
    await tx.update(draws).set({ mode }).where(eq(draws.id, drawId));
    await audit(tx, adminId, 'set_mode', drawId, { from: d.mode, to: mode }, ip);
    return { drawId, mode };
  });
}

export async function selectWinner(adminId: number, drawId: number, ticketNo: number, ip?: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const d = await lockEditableDraw(tx, drawId, now);
    if (ticketNo < TICKET_MIN || ticketNo > TICKET_MAX) throw new AppError(400, 'INVALID_TICKET', 'Ticket must be a 6-digit number');
    await tx.update(draws).set({ selectedTicketNo: ticketNo }).where(eq(draws.id, drawId));
    await audit(tx, adminId, 'select_winner', drawId, { previous: d.selectedTicketNo, ticketNo, mode: d.mode }, ip);
    return { drawId, selectedTicketNo: ticketNo, mode: d.mode };
  });
}

export async function adjustCoins(adminId: number, userId: number, amount: number, reason: string, ip?: string) {
  return db.transaction(async (tx) => {
    const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId));
    if (!u) throw notFound('User');
    const balance = await applyWallet(tx, userId, amount, 'admin_adjust');
    await audit(tx, adminId, 'adjust_coins', null, { userId, amount, reason, balance }, ip);
    return { userId, balance };
  });
}

export const listUsers = (limit = 100) =>
  db.select({ id: users.id, mobile: users.mobile, name: users.name, role: users.role, createdAt: users.createdAt, balance: wallets.balance })
    .from(users).leftJoin(wallets, eq(wallets.userId, users.id)).orderBy(desc(users.id)).limit(limit);

export const listDraws = (opts: { status?: string; packageId?: number; limit: number }) =>
  db.select({
    id: draws.id, packageId: draws.packageId, packageName: packages.name, status: draws.status, mode: draws.mode,
    drawTime: draws.drawTime, selectedTicketNo: draws.selectedTicketNo, winningTicketNo: draws.winningTicketNo,
    winMethod: draws.winMethod, maxTickets: draws.maxTickets,
    sold: sql<number>`(SELECT count(*)::int FROM ${tickets} WHERE ${tickets.drawId} = ${draws.id})`,
  }).from(draws).innerJoin(packages, eq(packages.id, draws.packageId))
    .where(and(
      opts.status ? eq(draws.status, opts.status as any) : undefined,
      opts.packageId ? eq(draws.packageId, opts.packageId) : undefined,
    )).orderBy(desc(draws.drawTime)).limit(opts.limit);

export const listAudit = (limit = 200) =>
  db.select().from(adminAuditLog).orderBy(desc(adminAuditLog.createdAt), desc(adminAuditLog.id)).limit(limit);
