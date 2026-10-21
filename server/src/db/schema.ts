import { sql } from 'drizzle-orm';
import {
  bigint, boolean, check, index, integer, jsonb, pgEnum, pgTable, primaryKey, serial, text, timestamp, uniqueIndex,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['user', 'admin']);
export const ledgerTypeEnum = pgEnum('ledger_type', [
  'signup_bonus', 'daily_claim', 'ticket_purchase', 'prize', 'refund', 'admin_adjust',
]);
export const prizeTypeEnum = pgEnum('prize_type', ['fixed', 'pool_percent']);
export const themeEnum = pgEnum('theme', ['green', 'red', 'blue']);
export const drawStatusEnum = pgEnum('draw_status', ['open', 'drawing', 'completed', 'cancelled']);
export const drawModeEnum = pgEnum('draw_mode', ['random', 'admin_selected']);

const ts = (name: string) => timestamp(name, { withTimezone: true });
const big = (name: string) => bigint(name, { mode: 'number' });

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  mobile: text('mobile').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('user'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const wallets = pgTable('wallets', {
  userId: integer('user_id').primaryKey().references(() => users.id),
  balance: big('balance').notNull().default(0),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [check('wallet_balance_nonneg', sql`${t.balance} >= 0`)]);

export const walletLedger = pgTable('wallet_ledger', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  amount: big('amount').notNull(),
  type: ledgerTypeEnum('type').notNull(),
  refId: integer('ref_id'),
  balanceAfter: big('balance_after').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  index('ledger_user_created_idx').on(t.userId, t.createdAt),
  // prize / refund can only be paid once per user per draw (belt and braces for job idempotency)
  uniqueIndex('ledger_pay_once_idx').on(t.userId, t.refId, t.type).where(sql`type IN ('prize','refund')`),
]);

export const packages = pgTable('packages', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  price: big('price').notNull(),
  prizeType: prizeTypeEnum('prize_type').notNull(),
  prizeValue: big('prize_value').notNull(),
  maxTickets: integer('max_tickets').notNull(),
  minTickets: integer('min_tickets').notNull(),
  drawIntervalMinutes: integer('draw_interval_minutes').notNull(),
  theme: themeEnum('theme').notNull(),
  isActive: boolean('is_active').notNull().default(true),
}, (t) => [
  check('pkg_price_pos', sql`${t.price} > 0`),
  check('pkg_max_range', sql`${t.maxTickets} BETWEEN 1 AND 9999`),
  check('pkg_min_range', sql`${t.minTickets} BETWEEN 0 AND ${t.maxTickets}`),
  check('pkg_interval_pos', sql`${t.drawIntervalMinutes} > 0`),
]);

// Package values are snapshotted onto each draw at open time, so editing a package never
// changes the rules of a draw people already bought into.
export const draws = pgTable('draws', {
  id: serial('id').primaryKey(),
  packageId: integer('package_id').notNull().references(() => packages.id),
  drawTime: ts('draw_time').notNull(),
  status: drawStatusEnum('status').notNull().default('open'),
  mode: drawModeEnum('mode').notNull().default('random'),
  selectedTicketNo: integer('selected_ticket_no'),
  winningTicketNo: integer('winning_ticket_no'),
  winnerUserId: integer('winner_user_id').references(() => users.id),
  prizeAmount: big('prize_amount'),
  winMethod: text('win_method'), // random | admin_selected | fallback_random
  ticketPrice: big('ticket_price').notNull(),
  prizeType: prizeTypeEnum('prize_type').notNull(),
  prizeValue: big('prize_value').notNull(),
  maxTickets: integer('max_tickets').notNull(),
  minTickets: integer('min_tickets').notNull(),
  serverSeedHash: text('server_seed_hash').notNull(),
  serverSeed: text('server_seed'), // null until reveal
  createdAt: ts('created_at').notNull().defaultNow(),
  completedAt: ts('completed_at'),
}, (t) => [
  index('draws_pkg_status_idx').on(t.packageId, t.status),
  index('draws_status_time_idx').on(t.status, t.drawTime),
  uniqueIndex('one_open_draw_per_package').on(t.packageId).where(sql`status = 'open'`),
]);

export const tickets = pgTable('tickets', {
  id: serial('id').primaryKey(),
  drawId: integer('draw_id').notNull().references(() => draws.id),
  userId: integer('user_id').notNull().references(() => users.id),
  ticketNo: integer('ticket_no').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('tickets_draw_no_uq').on(t.drawId, t.ticketNo),
  uniqueIndex('tickets_draw_user_uq').on(t.drawId, t.userId),
  index('tickets_user_idx').on(t.userId),
]);

export const adminAuditLog = pgTable('admin_audit_log', {
  id: serial('id').primaryKey(),
  adminId: integer('admin_id').references(() => users.id), // null = system action
  action: text('action').notNull(),
  drawId: integer('draw_id').references(() => draws.id),
  payload: jsonb('payload'),
  ip: text('ip'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('audit_created_idx').on(t.createdAt)]);

export const idempotencyKeys = pgTable('idempotency_keys', {
  key: text('key').notNull(),
  userId: integer('user_id').notNull().references(() => users.id),
  response: jsonb('response').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.key] })]);
