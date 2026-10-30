import { SQL, and, asc, desc, eq, gt, gte, ilike, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { type AnyPgColumn, alias } from 'drizzle-orm/pg-core';
import { Exec, Tx, db } from '../db';
import { adminAuditLog, depositRequests, drawTierPrizes, draws, packageTierPrizes, packages, refreshTokens, tickets, users, walletLedger, wallets, withdrawalRequests } from '../db/schema';
import { AppError, notFound } from '../lib/errors';
import { TIER_DIGITS, defaultTierPrizes } from '../lib/tiers';
import { TICKET_MAX, TICKET_MIN, invalidatePublicCache, nextDrawFor, openDraw, saveTierPrizes, snapshotTierPrizes } from './draws';
import { settleDraw } from './drawJob';
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
  const rescheduled = pkg.drawIntervalMinutes !== before.drawIntervalMinutes || pkg.dailyTime !== before.dailyTime
    || pkg.runOnceAt?.getTime() !== before.runOnceAt?.getTime();
  await tx.update(draws).set({
    ticketPrice: pkg.price, prizeType: pkg.prizeType, prizeValue: pkg.prizeValue, maxTickets: pkg.maxTickets,
    packageName: pkg.name, theme: pkg.theme,
    ...(rescheduled ? { drawTime: nextDrawFor(pkg, now, now) } : {}),
  }).where(eq(draws.id, drawId));
}

export async function createPackage(adminId: number, input: PkgInput, ip?: string, now = new Date()) {
  try { return await createPackageTx(adminId, input, ip, now); } finally { invalidatePublicCache(); }
}

async function createPackageTx(adminId: number, input: PkgInput, ip: string | undefined, now: Date) {
  return db.transaction(async (tx) => {
    if (input.runOnceAt && input.runOnceAt.getTime() <= now.getTime()) throw new AppError(400, 'VALIDATION', 'Run-once time must be in the future');
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
    if ([after.drawIntervalMinutes, after.dailyTime, after.runOnceAt].filter((v) => v != null).length !== 1) {
      throw new AppError(400, 'VALIDATION', 'Choose one schedule: repeat every N minutes, every day at a time, or run once');
    }
    const open = await editableOpenDraw(tx, id);
    // a draw is about to be scheduled at the run-once time (no draw running yet, or the time was changed): it must lie ahead
    const onceChanged = after.runOnceAt?.getTime() !== before.runOnceAt?.getTime();
    if (after.isActive && after.runOnceAt && (!open || onceChanged) && after.runOnceAt.getTime() <= now.getTime()) {
      throw new AppError(400, 'VALIDATION', 'Run-once time must be in the future');
    }
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

/**
 * Ticket buy window of a package, applied to all its draws: daily (IST "HH:MM") or one fixed start/end moment.
 * All null = no window. Not subject to the package edit lock: it never changes what a sold ticket was bought under.
 */
export async function setPackageSalesWindow(
  adminId: number, id: number,
  input: { buyStartTime: string | null; buyEndTime: string | null; buyStartAt: Date | null; buyEndAt: Date | null }, ip?: string,
) {
  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx.select().from(packages).where(and(eq(packages.id, id), isNull(packages.deletedAt))).for('update');
      if (!before) throw notFound('Package');
      await tx.update(packages).set(input).where(eq(packages.id, id));
      const win = (w: typeof input) => ({ start: w.buyStartTime, end: w.buyEndTime, startAt: w.buyStartAt, endAt: w.buyEndAt });
      await audit(tx, adminId, 'package_sales_window', null, { packageId: id, before: win(before), after: win(input) }, ip);
      return { id, ...input };
    });
  } finally { invalidatePublicCache(); }
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

/**
 * The admin types the winning ticket number; it must be a ticket sold in this draw. Before the draw runs it is
 * stored and wins at draw time. If the draw time passed with no selection (status 'drawing'), it announces the
 * result and pays out right away.
 */
export async function selectWinner(adminId: number, drawId: number, ticketNo: number, ip?: string, now = new Date()) {
  const res = await db.transaction(async (tx) => {
    const [d] = await tx.select().from(draws).where(eq(draws.id, drawId)).for('update');
    if (!d) throw notFound('Draw');
    if (d.status !== 'open' && d.status !== 'drawing') throw new AppError(400, 'DRAW_LOCKED', 'This draw already has its result');
    if (ticketNo < TICKET_MIN || ticketNo > TICKET_MAX) throw new AppError(400, 'INVALID_TICKET', 'Ticket must be a 6-digit number');
    const sold = await tx.select().from(tickets).where(eq(tickets.drawId, drawId)).orderBy(asc(tickets.ticketNo));
    if (!sold.some((t) => t.ticketNo === ticketNo)) {
      throw new AppError(400, 'TICKET_NOT_SOLD', `Ticket #${String(ticketNo).padStart(6, '0')} was not sold in this draw`);
    }
    await tx.update(draws).set({ selectedTicketNo: ticketNo }).where(eq(draws.id, drawId));
    await audit(tx, adminId, 'select_winner', drawId, { previous: d.selectedTicketNo, ticketNo }, ip);
    const announced = d.status === 'drawing';
    if (announced) await settleDraw(tx, d, sold, ticketNo, now);
    return { drawId, selectedTicketNo: ticketNo, announced };
  });
  if (res.announced) invalidatePublicCache();
  return res;
}

export async function adjustCoins(adminId: number, userId: number, amount: number, reason: string, ip?: string) {
  return db.transaction(async (tx) => {
    const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId));
    if (!u) throw notFound('User');
    const balance = await applyWallet(tx, userId, amount, 'admin_adjust', null, reason);
    await audit(tx, adminId, 'adjust_coins', null, { userId, amount, reason, balance }, ip);
    return { userId, balance };
  });
}

/** Block: the player can't log in or use the app, and every open session ends now. Unblock gives access back. */
export async function setUserBlocked(adminId: number, userId: number, blocked: boolean, reason: string, ip?: string) {
  return db.transaction(async (tx) => {
    const [u] = await tx.select({ role: users.role, blockedAt: users.blockedAt }).from(users).where(eq(users.id, userId)).for('update');
    if (!u) throw notFound('User');
    if (u.role !== 'user') throw new AppError(400, 'VALIDATION', 'Only players can be blocked');
    const now = new Date();
    const [after] = await tx.update(users).set({ blockedAt: blocked ? (u.blockedAt ?? now) : null }).where(eq(users.id, userId))
      .returning({ blockedAt: users.blockedAt });
    if (blocked) {
      await tx.update(refreshTokens).set({ revokedAt: now }).where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
    }
    await audit(tx, adminId, blocked ? 'user_block' : 'user_unblock', null, { userId, reason }, ip);
    return { userId, blockedAt: after.blockedAt };
  });
}

/**
 * Dashboard cards. Players only (admins excluded). Active = has coins in the wallet.
 * The active-income count has no feature behind it yet, so it is fixed at 0 until one exists.
 */
export async function dashboardSummary() {
  const [u] = await db.select({
    total: sql<number>`count(*)::int`,
    active: sql<number>`count(*) FILTER (WHERE ${wallets.balance} > 0)::int`,
    income: sql<number>`COALESCE(sum(${wallets.incomeBalance}), 0)::float8`,
    bonus: sql<number>`COALESCE(sum(${wallets.bonusBalance}), 0)::float8`,
    purchase: sql<number>`COALESCE(sum(${wallets.purchaseBalance}), 0)::float8`,
    wallet: sql<number>`COALESCE(sum(${wallets.balance}), 0)::float8`,
  }).from(users).leftJoin(wallets, eq(wallets.userId, users.id)).where(eq(users.role, 'user'));
  const [fund] = await db.select({
    pending: sql<number>`count(*) FILTER (WHERE ${depositRequests.status} = 'pending')::int`,
    completed: sql<number>`count(*) FILTER (WHERE ${depositRequests.status} = 'approved')::int`,
    completedAmount: sql<number>`COALESCE(sum(${depositRequests.amount}) FILTER (WHERE ${depositRequests.status} = 'approved'), 0)::float8`,
  }).from(depositRequests);
  const [out] = await db.select({
    pending: sql<number>`count(*) FILTER (WHERE ${withdrawalRequests.status} = 'pending')::int`,
    paid: sql<number>`COALESCE(sum(${withdrawalRequests.amount}) FILTER (WHERE ${withdrawalRequests.status} = 'approved'), 0)::float8`,
  }).from(withdrawalRequests);
  return {
    totalUsers: u.total, activeUsers: u.active, inactiveUsers: u.total - u.active,
    activeIncomeUsers: 0,
    pendingFundRequests: fund.pending,
    completedFundRequests: fund.completed, completedFundAmount: fund.completedAmount, // approved: money added to wallets
    totalWithdrawal: out.paid, pendingWithdrawals: out.pending, // approved = paid out
    totalWallet: u.wallet, purchaseWallet: u.purchase, incomeWallet: u.income, bonusWallet: u.bonus,
  };
}

export const USER_SORTS = ['newest', 'name', 'balance', 'deposited', 'won', 'spent', 'tickets', 'lastPlayed'] as const;
export type UserSort = (typeof USER_SORTS)[number];
export type UserFilter = 'all' | 'active' | 'inactive' | 'income' | 'blocked';
export const USER_SEARCH_FIELDS = ['any', 'userId', 'memberId', 'name', 'phone', 'sponsor'] as const;
export type UserSearchField = (typeof USER_SEARCH_FIELDS)[number];
const referrer = alias(users, 'referrer');
/** "YYYY-MM-DD" as the start of that day in Indian Standard Time. */
export const istDayStart = (day: string) => new Date(`${day}T00:00:00+05:30`);

/**
 * Search box: user ID = login ID, member ID = numeric id or referral code, sponsor = the referrer's user ID / member ID.
 * 'any' covers the player's own fields only; a sponsor search would also list everyone that player referred.
 */
function userSearch(text: string, by: UserSearchField) {
  const pat = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  // a number is an exact id (or an all-digit referral code): partly matching it would hit most hex referral codes
  const id = /^[1-9]\d{0,8}$/.test(text) ? Number(text) : null;
  const member = (u: { id: AnyPgColumn; referralCode: AnyPgColumn }) => (id !== null ? or(eq(u.id, id), eq(u.referralCode, text.toUpperCase())) : ilike(u.referralCode, pat));
  const own = { userId: ilike(users.username, pat), memberId: member(users), name: ilike(users.name, pat), phone: ilike(users.phone, pat) };
  if (by === 'sponsor') return or(ilike(referrer.username, pat), member(referrer));
  return by === 'any' ? or(...Object.values(own)) : own[by];
}

/**
 * Players with their overall numbers (one page, 1-based), plus totals over all players for the header.
 * Active = coins in the wallet (same rule as the dashboard). 'income' matches nobody until an income plan exists.
 */
export async function usersReport(opts: {
  search?: string; searchBy?: UserSearchField; joinedFrom?: string; joinedTo?: string;
  status?: UserFilter; sort?: UserSort; page?: number; pageSize?: number;
} = {}) {
  const page = opts.page ?? 1, pageSize = opts.pageSize ?? 25;
  const amount = walletLedger.amount, type = walletLedger.type;
  const ls = db.select({
    userId: walletLedger.userId,
    deposited: sql<string>`sum(${amount}) FILTER (WHERE ${type} = 'deposit')`.as('deposited'),
    won: sql<string>`sum(${amount}) FILTER (WHERE ${type} = 'prize')`.as('won'),
    bonus: sql<string>`sum(${amount}) FILTER (WHERE ${type} IN ('referral_bonus', 'bulk_bonus', 'signup_bonus', 'daily_claim'))`.as('bonus'),
    spent: sql<string>`-sum(${amount}) FILTER (WHERE ${type} = 'ticket_purchase')`.as('spent'),
  }).from(walletLedger).groupBy(walletLedger.userId).as('ls');
  const ta = db.select({
    userId: tickets.userId, ticketCount: sql<number>`count(*)`.as('ticket_count'), lastTicketAt: sql<Date>`max(${tickets.createdAt})`.as('last_ticket_at'),
  }).from(tickets).groupBy(tickets.userId).as('ta');
  const wa = db.select({ userId: draws.winnerUserId, winCount: sql<number>`count(*)`.as('win_count') })
    .from(draws).where(eq(draws.status, 'completed')).groupBy(draws.winnerUserId).as('wa');
  const pa = db.select({ userId: depositRequests.userId, pendingCount: sql<number>`count(*)`.as('pending_count') })
    .from(depositRequests).where(eq(depositRequests.status, 'pending')).groupBy(depositRequests.userId).as('pa');

  const num = (e: SQL | unknown) => sql<number>`COALESCE(${e}, 0)::float8`;
  const col = {
    deposited: num(ls.deposited), won: num(ls.won), bonus: num(ls.bonus), spent: num(ls.spent),
    tickets: sql<number>`COALESCE(${ta.ticketCount}, 0)::int`, wins: sql<number>`COALESCE(${wa.winCount}, 0)::int`,
    pending: sql<number>`COALESCE(${pa.pendingCount}, 0)::int`, balance: num(wallets.balance), income: num(wallets.incomeBalance),
    purchaseWallet: num(wallets.purchaseBalance), bonusWallet: num(wallets.bonusBalance),
  };
  const where = and(
    eq(users.role, 'user'),
    opts.search ? userSearch(opts.search, opts.searchBy ?? 'any') : undefined,
    opts.joinedFrom ? gte(users.createdAt, istDayStart(opts.joinedFrom)) : undefined,
    opts.joinedTo ? lt(users.createdAt, new Date(istDayStart(opts.joinedTo).getTime() + 86_400_000)) : undefined,
    opts.status === 'active' ? gt(wallets.balance, 0)
      : opts.status === 'inactive' ? sql`COALESCE(${wallets.balance}, 0) = 0`
      : opts.status === 'income' ? sql`false`
      : opts.status === 'blocked' ? isNotNull(users.blockedAt) : undefined,
  );
  const order = {
    newest: [desc(users.id)], name: [asc(users.name), desc(users.id)], balance: [desc(col.balance), desc(users.id)],
    deposited: [desc(col.deposited), desc(users.id)], won: [desc(col.won), desc(users.id)], spent: [desc(col.spent), desc(users.id)],
    tickets: [desc(col.tickets), desc(users.id)], lastPlayed: [sql`${ta.lastTicketAt} DESC NULLS LAST`, desc(users.id)],
  }[opts.sort ?? 'newest'];

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(users)
    .leftJoin(wallets, eq(wallets.userId, users.id)).leftJoin(referrer, eq(referrer.id, users.referredBy)).where(where);
  const rows = await db.select({
    id: users.id, username: users.username, name: users.name, phone: users.phone, createdAt: users.createdAt,
    referralCode: users.referralCode, referredByName: referrer.name, referredByUsername: referrer.username, blockedAt: users.blockedAt,
    balance: col.balance, purchaseBalance: col.purchaseWallet, incomeBalance: col.income, bonusBalance: col.bonusWallet,
    deposited: col.deposited, won: col.won, bonus: col.bonus, spent: col.spent,
    tickets: col.tickets, wins: col.wins, lastTicketAt: ta.lastTicketAt, pendingRequests: col.pending,
  }).from(users)
    .leftJoin(wallets, eq(wallets.userId, users.id))
    .leftJoin(referrer, eq(referrer.id, users.referredBy))
    .leftJoin(ls, eq(ls.userId, users.id))
    .leftJoin(ta, eq(ta.userId, users.id))
    .leftJoin(wa, eq(wa.userId, users.id))
    .leftJoin(pa, eq(pa.userId, users.id))
    .where(where).orderBy(...order).limit(pageSize).offset((page - 1) * pageSize);

  const [t] = await db.select({
    players: sql<number>`count(*)::int`,
    active: sql<number>`count(*) FILTER (WHERE ${wallets.balance} > 0)::int`,
    blocked: sql<number>`count(*) FILTER (WHERE ${users.blockedAt} IS NOT NULL)::int`,
    balance: num(sql`sum(${wallets.balance})`), income: num(sql`sum(${wallets.incomeBalance})`), bonus: num(sql`sum(${wallets.bonusBalance})`),
    purchase: num(sql`sum(${wallets.purchaseBalance})`),
  }).from(users).leftJoin(wallets, eq(wallets.userId, users.id)).where(eq(users.role, 'user'));
  const [m] = await db.select({
    deposited: num(sql`sum(${amount}) FILTER (WHERE ${type} = 'deposit')`),
    won: num(sql`sum(${amount}) FILTER (WHERE ${type} = 'prize')`),
    spent: num(sql`-sum(${amount}) FILTER (WHERE ${type} = 'ticket_purchase')`),
  }).from(walletLedger).innerJoin(users, eq(users.id, walletLedger.userId)).where(eq(users.role, 'user'));

  return {
    users: rows.map((r) => ({ ...r, active: r.balance > 0 })),
    total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)),
    totals: {
      players: t.players, active: t.active, inactive: t.players - t.active, income: 0, blocked: t.blocked,
      balance: t.balance, incomeBalance: t.income, bonusBalance: t.bonus, purchaseBalance: t.purchase, deposited: m.deposited, won: m.won, spent: m.spent,
    },
  };
}

export const listUsers = (limit = 100) =>
  db.select({ id: users.id, username: users.username, name: users.name, role: users.role, createdAt: users.createdAt, balance: wallets.balance, purchaseBalance: wallets.purchaseBalance, incomeBalance: wallets.incomeBalance, bonusBalance: wallets.bonusBalance })
    .from(users).leftJoin(wallets, eq(wallets.userId, users.id)).orderBy(desc(users.id)).limit(limit);

export const listDraws = (opts: { status?: string; packageId?: number; limit: number }) =>
  db.select({
    id: draws.id, packageId: draws.packageId, packageName: draws.packageName, theme: draws.theme, status: draws.status,
    drawTime: draws.drawTime, selectedTicketNo: draws.selectedTicketNo, winningTicketNo: draws.winningTicketNo,
    winMethod: draws.winMethod, maxTickets: draws.maxTickets, prizeAmount: draws.prizeAmount, winnerName: users.name,
    sold: sql<number>`(SELECT count(*)::int FROM ${tickets} WHERE ${tickets.drawId} = ${draws.id})`,
  }).from(draws).leftJoin(users, eq(users.id, draws.winnerUserId))
    .where(and(
      opts.status ? eq(draws.status, opts.status as any) : undefined,
      opts.packageId ? eq(draws.packageId, opts.packageId) : undefined,
    )).orderBy(desc(draws.drawTime)).limit(opts.limit);

/** One row per completed draw that had a winner, newest first. */
export const listWinners = (limit = 500) =>
  db.select({
    drawId: draws.id, packageName: draws.packageName, drawTime: draws.drawTime, ticketNo: draws.winningTicketNo,
    prizeAmount: draws.prizeAmount, winMethod: draws.winMethod,
    userId: users.id, name: users.name, username: users.username,
  }).from(draws)
    .innerJoin(users, eq(users.id, draws.winnerUserId))
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
