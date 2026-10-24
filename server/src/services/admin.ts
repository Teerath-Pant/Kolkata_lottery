import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { Exec, Tx, db } from '../db';
import { adminAuditLog, drawTierPrizes, draws, packageTierPrizes, packages, tickets, users, wallets } from '../db/schema';
import { AppError, notFound } from '../lib/errors';
import { TIER_DIGITS, defaultTierPrizes } from '../lib/tiers';
import { TICKET_MAX, TICKET_MIN, invalidatePublicCache, nextDrawFor, openDraw, saveTierPrizes, snapshotTierPrizes } from './draws';
import { applyWallet } from './wallet';

export const audit = (exec: Exec, adminId: number, action: string, drawId: number | null, payload: unknown, ip?: string) =>
  exec.insert(adminAuditLog).values({ adminId, action, drawId, payload: payload as any, ip: ip ?? null });

type PkgInput = Omit<typeof packages.$inferInsert, 'id'>;
type Pkg = typeof packages.$inferSelect;

/**
 * Locks the package's open draw (buy locks the same row, so no race) and refuses edits once anyone has bought into it:
 * a package can change only while its open draw has no tickets, i.e. before sales start or after the result is out.
 */
async function editableOpenDraw(tx: Tx, packageId: number) {
  const [open] = await tx.select().from(draws).where(and(eq(draws.packageId, packageId), eq(draws.status, 'open'))).for('update');
  if (!open) return null;
  const [{ sold }] = await tx.select({ sold: sql<number>`count(*)::int` }).from(tickets).where(eq(tickets.drawId, open.id));
  if (sold > 0) {
    throw new AppError(409, 'PACKAGE_LOCKED', `${sold} ticket${sold === 1 ? ' is' : 's are'} already sold in the running draw. Edit this package after its result is announced.`);
  }
  return open;
}

/** The open draw has no players yet, so it takes the new rules right away. */
async function applyToOpenDraw(tx: Tx, drawId: number, pkg: Pkg, before: Pkg, now: Date) {
  const rescheduled = pkg.drawIntervalMinutes !== before.drawIntervalMinutes || pkg.dailyTime !== before.dailyTime;
  await tx.update(draws).set({
    ticketPrice: pkg.price, prizeType: pkg.prizeType, prizeValue: pkg.prizeValue, maxTickets: pkg.maxTickets,
    ...(rescheduled ? { drawTime: nextDrawFor(pkg, now, now) } : {}),
  }).where(eq(draws.id, drawId));
}

export async function createPackage(adminId: number, input: PkgInput, ip?: string, now = new Date()) {
  try { return await createPackageTx(adminId, input, ip, now); } finally { invalidatePublicCache(); }
}

async function createPackageTx(adminId: number, input: PkgInput, ip: string | undefined, now: Date) {
  return db.transaction(async (tx) => {
    const [pkg] = await tx.insert(packages).values(input).returning();
    await saveTierPrizes(tx, pkg.id, Object.entries(defaultTierPrizes(pkg.price)).map(([k, prize]) => ({ matchDigits: Number(k), prize })));
    if (pkg.isActive) await openDraw(tx, pkg, nextDrawFor(pkg, now, now));
    await audit(tx, adminId, 'package_create', null, pkg, ip);
    return pkg;
  });
}

export async function updatePackage(adminId: number, id: number, patch: Partial<PkgInput>, ip?: string, now = new Date()) {
  try { return await updatePackageTx(adminId, id, patch, ip, now); } finally { invalidatePublicCache(); }
}

async function updatePackageTx(adminId: number, id: number, patch: Partial<PkgInput>, ip: string | undefined, now: Date) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(packages).where(and(eq(packages.id, id), isNull(packages.deletedAt))).for('update');
    if (!before) throw notFound('Package');
    const after = { ...before, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
    if ((after.drawIntervalMinutes != null) === (after.dailyTime != null)) {
      throw new AppError(400, 'VALIDATION', 'Choose either an interval or a daily time, not both');
    }
    const open = await editableOpenDraw(tx, id);
    const [pkg] = await tx.update(packages).set(patch).where(eq(packages.id, id)).returning();
    if (open) await applyToOpenDraw(tx, open.id, pkg, before, now);
    else if (pkg.isActive) await openDraw(tx, pkg, nextDrawFor(pkg, now, now)); // re-activated package with no open draw gets one
    await audit(tx, adminId, 'package_update', open?.id ?? null, { before, patch }, ip);
    return pkg;
  });
}

export async function deletePackage(adminId: number, id: number, ip?: string, now = new Date()) {
  try { return await deletePackageTx(adminId, id, ip, now); } finally { invalidatePublicCache(); }
}

/** Soft delete: hidden everywhere and no new draws. Refused while the running draw has tickets; an empty one is cancelled. */
async function deletePackageTx(adminId: number, id: number, ip: string | undefined, now: Date) {
  return db.transaction(async (tx) => {
    const [pkg] = await tx.select().from(packages).where(and(eq(packages.id, id), isNull(packages.deletedAt))).for('update');
    if (!pkg) throw notFound('Package');
    const open = await editableOpenDraw(tx, id);
    if (open) await tx.update(draws).set({ status: 'cancelled', completedAt: now }).where(eq(draws.id, open.id));
    await tx.update(packages).set({ isActive: false, deletedAt: now }).where(eq(packages.id, id));
    await audit(tx, adminId, 'package_delete', open?.id ?? null, pkg, ip);
    return { id };
  });
}

export async function listPackagesWithTiers() {
  const pkgs = await db.select().from(packages).where(isNull(packages.deletedAt)).orderBy(packages.price);
  const tiers = await db.select().from(packageTierPrizes);
  const sold = await db.select({ packageId: draws.packageId, n: sql<number>`count(${tickets.id})::int` }).from(draws)
    .leftJoin(tickets, eq(tickets.drawId, draws.id)).where(eq(draws.status, 'open')).groupBy(draws.packageId);
  return pkgs.map((p) => ({
    ...p,
    openDrawSold: sold.find((s) => s.packageId === p.id)?.n ?? 0, // > 0: package is locked until that draw's result
    tierPrizes: Object.fromEntries(TIER_DIGITS.map((k) => [k, tiers.find((t) => t.packageId === p.id && t.matchDigits === k)?.prize ?? 0])),
  }));
}

/** Sets the leading-digit prizes for the open draw (refused once it has tickets) and every later draw. */
export async function setTierPrizes(adminId: number, packageId: number, prizes: { matchDigits: number; prize: number }[], ip?: string) {
  try { return await setTierPrizesTx(adminId, packageId, prizes, ip); } finally { invalidatePublicCache(); }
}

async function setTierPrizesTx(adminId: number, packageId: number, prizes: { matchDigits: number; prize: number }[], ip?: string) {
  return db.transaction(async (tx) => {
    const [pkg] = await tx.select({ id: packages.id }).from(packages).where(and(eq(packages.id, packageId), isNull(packages.deletedAt))).for('update');
    if (!pkg) throw notFound('Package');
    const before = await tx.select().from(packageTierPrizes).where(eq(packageTierPrizes.packageId, packageId));
    const open = await editableOpenDraw(tx, packageId);
    await saveTierPrizes(tx, packageId, prizes);
    if (open) {
      await tx.delete(drawTierPrizes).where(eq(drawTierPrizes.drawId, open.id));
      await snapshotTierPrizes(tx, open.id, packageId);
    }
    await audit(tx, adminId, 'tier_prizes_update', open?.id ?? null, { packageId, before, after: prizes }, ip);
    return { packageId, prizes };
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
  db.select({ id: users.id, username: users.username, name: users.name, role: users.role, createdAt: users.createdAt, balance: wallets.balance })
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

/** One row per completed draw that had a winner, newest first. */
export const listWinners = (limit = 500) =>
  db.select({
    drawId: draws.id, packageName: packages.name, drawTime: draws.drawTime, ticketNo: draws.winningTicketNo,
    prizeAmount: draws.prizeAmount, winMethod: draws.winMethod,
    userId: users.id, name: users.name, username: users.username,
  }).from(draws)
    .innerJoin(users, eq(users.id, draws.winnerUserId))
    .innerJoin(packages, eq(packages.id, draws.packageId))
    .where(eq(draws.status, 'completed')).orderBy(desc(draws.drawTime)).limit(limit);

/**
 * Admin change history, newest first, one page at a time (page is 1-based), with the total for the pager
 * and the names the UI needs (who did it, which package / draw / user).
 */
export async function listAudit(opts: { action?: string; adminId?: number; page?: number; pageSize?: number } = {}) {
  const page = opts.page ?? 1, pageSize = opts.pageSize ?? 25;
  const filter = and(
    opts.action ? eq(adminAuditLog.action, opts.action) : undefined,
    opts.adminId ? eq(adminAuditLog.adminId, opts.adminId) : undefined,
  );
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(adminAuditLog).where(filter);
  const rows = await db.select({ a: adminAuditLog, adminName: users.name, adminUsername: users.username })
    .from(adminAuditLog).leftJoin(users, eq(users.id, adminAuditLog.adminId)).where(filter)
    .orderBy(desc(adminAuditLog.id)).limit(pageSize).offset((page - 1) * pageSize);

  const p = (r: (typeof rows)[number]) => (r.a.payload ?? {}) as Record<string, any>;
  const drawIds = [...new Set(rows.map((r) => r.a.drawId).filter((x): x is number => x !== null))];
  const drawPkg = drawIds.length
    ? new Map((await db.select({ id: draws.id, packageId: draws.packageId }).from(draws).where(inArray(draws.id, drawIds))).map((d) => [d.id, d.packageId]))
    : new Map<number, number>();
  const pkgIdOf = (r: (typeof rows)[number]): number | undefined =>
    p(r).packageId ?? p(r).before?.id ?? (['package_create', 'package_delete'].includes(r.a.action) ? p(r).id : undefined) ?? (r.a.drawId ? drawPkg.get(r.a.drawId) : undefined);
  const pkgIds = [...new Set(rows.map(pkgIdOf).filter((x): x is number => typeof x === 'number'))];
  const userIds = [...new Set(rows.map((r) => p(r).userId).filter((x): x is number => typeof x === 'number'))];
  const pkgNames = pkgIds.length
    ? new Map((await db.select({ id: packages.id, name: packages.name }).from(packages).where(inArray(packages.id, pkgIds))).map((x) => [x.id, x.name]))
    : new Map<number, string>();
  const userNames = userIds.length
    ? new Map((await db.select({ id: users.id, name: users.name, username: users.username }).from(users).where(inArray(users.id, userIds))).map((x) => [x.id, x]))
    : new Map<number, { name: string; username: string }>();

  const log = rows.map((r) => {
    const pkgId = pkgIdOf(r);
    const target = userNames.get(p(r).userId);
    return {
      ...r.a,
      adminName: r.adminName, adminUsername: r.adminUsername,
      packageId: pkgId ?? null, packageName: pkgId !== undefined ? pkgNames.get(pkgId) ?? null : null,
      targetUserName: target?.name ?? null, targetUsername: target?.username ?? null,
    };
  });
  return { log, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}
