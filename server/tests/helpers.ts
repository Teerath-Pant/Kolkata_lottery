import { db, pool } from '../src/db';
import { runMigrations } from '../src/db/migrate';
import { draws, packages, tickets, users, wallets } from '../src/db/schema';
import { openDraw } from '../src/services/draws';
import { eq } from 'drizzle-orm';

export async function resetDb() {
  await runMigrations();
  await pool.query(
    'TRUNCATE idempotency_keys, admin_audit_log, tickets, wallet_ledger, draws, packages, wallets, users RESTART IDENTITY CASCADE',
  );
}

let n = 0;
export async function makeUser(balance = 1000) {
  const i = ++n;
  const [u] = await db.insert(users).values({ mobile: `9${String(i).padStart(9, '0')}`, name: `User${i}`, passwordHash: 'x' }).returning();
  await db.insert(wallets).values({ userId: u.id, balance });
  return u;
}

export const balanceOf = async (userId: number) =>
  (await db.select().from(wallets).where(eq(wallets.userId, userId)))[0].balance;

export async function makeDraw(opts: {
  price?: number; prizeType?: 'fixed' | 'pool_percent'; prizeValue?: number;
  max?: number; min?: number; drawTime?: Date; mode?: 'random' | 'admin_selected';
} = {}) {
  const [pkg] = await db.insert(packages).values({
    name: 'Test', price: opts.price ?? 50, prizeType: opts.prizeType ?? 'fixed', prizeValue: opts.prizeValue ?? 1000,
    maxTickets: opts.max ?? 100, minTickets: opts.min ?? 0, drawIntervalMinutes: 30, theme: 'green',
  }).returning();
  const draw = await openDraw(db, pkg, opts.drawTime ?? new Date(Date.now() + 3600_000));
  if (opts.mode) await db.update(draws).set({ mode: opts.mode }).where(eq(draws.id, draw.id));
  return { pkg, draw };
}

/** Insert sold tickets directly (bypasses the buy cutoff so due draws can be built). */
export async function sellTickets(drawId: number, price: number, count: number, startNo = 100001) {
  const sold: { userId: number; ticketNo: number }[] = [];
  for (let i = 0; i < count; i++) {
    const u = await makeUser(1000 - price); // as if they already paid
    await db.insert(tickets).values({ drawId, userId: u.id, ticketNo: startNo + i });
    sold.push({ userId: u.id, ticketNo: startNo + i });
  }
  return sold;
}

export const closePool = () => pool.end();
