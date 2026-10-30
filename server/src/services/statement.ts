import { SQL, and, desc, eq, gt, gte, ilike, inArray, lt, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { depositRequests, draws, ledgerTypeEnum, users, walletLedger, wallets, withdrawalRequests } from '../db/schema';
import { istDayStart } from './admin';
import { BONUS_TYPES } from './wallet';

export const LEDGER_TYPES = ledgerTypeEnum.enumValues;
export type LedgerType = (typeof LEDGER_TYPES)[number];
export const STATEMENT_MAX_EXPORT = 5000;

export interface StatementQuery {
  search?: string; type?: LedgerType; direction?: 'credit' | 'debit'; from?: string; to?: string; page?: number; pageSize?: number;
  bonus?: boolean; // only bonus credits (referral, bulk-buy, old signup / daily)
}

const DRAW_TYPES: LedgerType[] = ['ticket_purchase', 'prize', 'refund', 'bulk_bonus'];

/** The statement remark: what the ledger row was for, filled in from the draw / player / request it points at. */
function remark(r: { type: LedgerType; refId: number | null; note: string | null }, ref: {
  draws: Map<number, string>; players: Map<number, { name: string; username: string }>; deposits: Map<number, string | null>;
  withdrawals: Map<number, { upiId: string; payoutRef: string | null }>;
}) {
  const pkg = r.refId !== null ? ref.draws.get(r.refId) : undefined;
  const draw = r.refId !== null ? `${pkg ?? 'Draw'} · draw #${r.refId}` : '';
  switch (r.type) {
    case 'ticket_purchase': return `Ticket bought · ${draw}`;
    case 'prize': return `Prize won · ${draw}`;
    case 'refund': return `Refund, draw cancelled · ${draw}`;
    case 'bulk_bonus': return `Bulk-buy bonus · ${draw}`;
    case 'referral_bonus': {
      const p = r.refId !== null ? ref.players.get(r.refId) : undefined;
      return p ? `Referral bonus · ${p.name} (${p.username}) joined` : 'Referral bonus';
    }
    case 'deposit': {
      const utr = r.refId !== null ? ref.deposits.get(r.refId) : null;
      return `Add money request #${r.refId}${utr ? ` · UTR ${utr}` : ''}`;
    }
    case 'withdrawal': {
      const w = r.refId !== null ? ref.withdrawals.get(r.refId) : undefined;
      return `Withdrawal #${r.refId}${w ? ` · to ${w.upiId}${w.payoutRef ? ` · ref ${w.payoutRef}` : ''}` : ''}`;
    }
    case 'admin_adjust': return r.note ? `Admin adjustment · ${r.note}` : 'Admin adjustment';
    case 'signup_bonus': return 'Welcome bonus · on signup';
    case 'daily_claim': return 'Daily free coins';
  }
}

/**
 * Every wallet transaction of every player, newest first, one page at a time (page is 1-based).
 * Search: name, user ID, or the exact member ID. Dates are whole days in Indian Standard Time.
 * Also returns credit / debit totals for the filtered set, and per-type counts that ignore the type filter (for the chips).
 */
export async function walletStatement(q: StatementQuery = {}) {
  const page = q.page ?? 1, pageSize = q.pageSize ?? 25;
  const amount = walletLedger.amount;
  const text = q.search?.trim();
  const pat = text ? `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const memberId = text && /^[1-9]\d{0,8}$/.test(text) ? Number(text) : null;
  const base: (SQL | undefined)[] = [
    eq(users.role, 'user'),
    pat ? or(ilike(users.name, pat), ilike(users.username, pat), memberId !== null ? eq(users.id, memberId) : undefined) : undefined,
    q.direction === 'credit' ? gt(amount, 0) : q.direction === 'debit' ? lt(amount, 0) : undefined,
    q.from ? gte(walletLedger.createdAt, istDayStart(q.from)) : undefined,
    q.to ? lt(walletLedger.createdAt, new Date(istDayStart(q.to).getTime() + 86_400_000)) : undefined,
  ];
  const where = and(...base, q.bonus ? inArray(walletLedger.type, BONUS_TYPES) : undefined, q.type ? eq(walletLedger.type, q.type) : undefined);

  const rows = await db.select({
    id: walletLedger.id, userId: walletLedger.userId, name: users.name, username: users.username,
    type: walletLedger.type, amount, refId: walletLedger.refId, note: walletLedger.note,
    balanceAfter: walletLedger.balanceAfter, createdAt: walletLedger.createdAt,
  }).from(walletLedger).innerJoin(users, eq(users.id, walletLedger.userId))
    .where(where).orderBy(desc(walletLedger.createdAt), desc(walletLedger.id)).limit(pageSize).offset((page - 1) * pageSize);

  const [sum] = await db.select({
    count: sql<number>`count(*)::int`,
    credit: sql<number>`COALESCE(sum(${amount}) FILTER (WHERE ${amount} > 0), 0)::float8`,
    debit: sql<number>`COALESCE(-sum(${amount}) FILTER (WHERE ${amount} < 0), 0)::float8`,
  }).from(walletLedger).innerJoin(users, eq(users.id, walletLedger.userId)).where(where);
  const types = await db.select({ type: walletLedger.type, count: sql<number>`count(*)::int` })
    .from(walletLedger).innerJoin(users, eq(users.id, walletLedger.userId)).where(and(...base)).groupBy(walletLedger.type);

  // what each row points at, in 4 queries for the whole page
  const ids = (pick: (t: LedgerType) => boolean) => [...new Set(rows.filter((r) => pick(r.type) && r.refId !== null).map((r) => r.refId!))];
  const drawIds = ids((t) => DRAW_TYPES.includes(t)), playerIds = ids((t) => t === 'referral_bonus'), depositIds = ids((t) => t === 'deposit');
  const withdrawalIds = ids((t) => t === 'withdrawal');
  const ref = {
    draws: new Map(drawIds.length ? (await db.select({ id: draws.id, name: draws.packageName }).from(draws).where(inArray(draws.id, drawIds))).map((d) => [d.id, d.name]) : []),
    players: new Map(playerIds.length ? (await db.select({ id: users.id, name: users.name, username: users.username }).from(users).where(inArray(users.id, playerIds))).map((u) => [u.id, u]) : []),
    withdrawals: new Map(withdrawalIds.length ? (await db.select({ id: withdrawalRequests.id, upiId: withdrawalRequests.upiId, payoutRef: withdrawalRequests.payoutRef })
      .from(withdrawalRequests).where(inArray(withdrawalRequests.id, withdrawalIds))).map((w) => [w.id, w]) : []),
    deposits: new Map(depositIds.length ? (await db.select({ id: depositRequests.id, utr: depositRequests.utr }).from(depositRequests).where(inArray(depositRequests.id, depositIds))).map((d) => [d.id, d.utr]) : []),
  };

  return {
    rows: rows.map(({ note, ...r }) => ({
      ...r, direction: r.amount >= 0 ? 'credit' as const : 'debit' as const, remark: remark({ ...r, note }, ref),
      drawId: DRAW_TYPES.includes(r.type) ? r.refId : null,
    })),
    total: sum.count, page, pageSize, pages: Math.max(1, Math.ceil(sum.count / pageSize)),
    summary: { count: sum.count, credit: sum.credit, debit: sum.debit, net: sum.credit - sum.debit },
    types: Object.fromEntries(types.map((t) => [t.type, t.count])) as Partial<Record<LedgerType, number>>,
  };
}

export const BONUS_SORTS = ['total', 'newest', 'name'] as const;

/**
 * Who got bonus money and from which source, one row per player (one page, 1-based), biggest first.
 * `received` comes from the ledger (never shrinks); `inWallet` is what is still in the bonus wallet (the rest was spent).
 * Totals cover every player, not just the page.
 */
export async function bonusReport(opts: { search?: string; sort?: (typeof BONUS_SORTS)[number]; page?: number; pageSize?: number } = {}) {
  const page = opts.page ?? 1, pageSize = opts.pageSize ?? 25;
  const amount = walletLedger.amount;
  const text = opts.search?.trim();
  const pat = text ? `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const memberId = text && /^[1-9]\d{0,8}$/.test(text) ? Number(text) : null;
  const sum = (...t: LedgerType[]) => sql<number>`COALESCE(sum(${amount}) FILTER (WHERE ${walletLedger.type} IN (${sql.join(t.map((x) => sql`${x}`), sql`, `)})), 0)::float8`;
  const where = and(
    eq(users.role, 'user'), inArray(walletLedger.type, BONUS_TYPES),
    pat ? or(ilike(users.name, pat), ilike(users.username, pat), memberId !== null ? eq(users.id, memberId) : undefined) : undefined,
  );
  const cols = {
    referral: sum('referral_bonus'), bulk: sum('bulk_bonus'), signup: sum('signup_bonus', 'daily_claim'),
    received: sql<number>`COALESCE(sum(${amount}), 0)::float8`,
    count: sql<number>`count(*)::int`,
    last: sql<Date>`max(${walletLedger.createdAt})`,
  };
  const order = opts.sort === 'name' ? [users.name, users.id] : opts.sort === 'newest' ? [desc(cols.last), desc(users.id)] : [desc(cols.received), desc(users.id)];

  const rows = await db.select({ userId: users.id, name: users.name, username: users.username, ...cols, inWallet: wallets.bonusBalance })
    .from(walletLedger).innerJoin(users, eq(users.id, walletLedger.userId)).leftJoin(wallets, eq(wallets.userId, users.id))
    .where(where).groupBy(users.id, wallets.bonusBalance).orderBy(...order).limit(pageSize).offset((page - 1) * pageSize);
  const [{ total }] = await db.select({ total: sql<number>`count(DISTINCT ${users.id})::int` })
    .from(walletLedger).innerJoin(users, eq(users.id, walletLedger.userId)).where(where);
  const [t] = await db.select({ ...cols, players: sql<number>`count(DISTINCT ${walletLedger.userId})::int` })
    .from(walletLedger).innerJoin(users, eq(users.id, walletLedger.userId)).where(and(eq(users.role, 'user'), inArray(walletLedger.type, BONUS_TYPES)));
  const [held] = await db.select({ n: sql<number>`COALESCE(sum(${wallets.bonusBalance}), 0)::float8` }).from(wallets).innerJoin(users, eq(users.id, wallets.userId)).where(eq(users.role, 'user'));

  return {
    players: rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)),
    totals: { received: t.received, referral: t.referral, bulk: t.bulk, signup: t.signup, players: t.players, credits: t.count, inWallets: held.n },
  };
}
