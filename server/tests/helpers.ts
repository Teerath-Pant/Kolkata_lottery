import { db, pool } from '../src/db';
import { runMigrations } from '../src/db/migrate';
import { draws, packages, tickets, users, wallets } from '../src/db/schema';
import { openDraw } from '../src/services/draws';
import { asc, eq } from 'drizzle-orm';

export async function resetDb() {
  await runMigrations();
  await pool.query(
    'TRUNCATE idempotency_keys, admin_audit_log, tickets, wallet_ledger, draws, packages, wallets, users RESTART IDENTITY CASCADE',
  );
}

let n = 0;
export async function makeUser(balance = 1000) {
  const i = ++n;
  const [u] = await db.insert(users).values({ username: `9${String(i).padStart(9, '0')}`, name: `User${i}`, passwordHash: 'x' }).returning();
  await db.insert(wallets).values({ userId: u.id, balance });
  return u;
}

export const balanceOf = async (userId: number) =>
  (await db.select().from(wallets).where(eq(wallets.userId, userId)))[0].balance;

export async function makeDraw(opts: {
  price?: number; prizeType?: 'fixed' | 'pool_percent'; prizeValue?: number;
  max?: number; drawTime?: Date; mode?: 'random' | 'admin_selected';
} = {}) {
  const [pkg] = await db.insert(packages).values({
    name: 'Test', price: opts.price ?? 50, prizeType: opts.prizeType ?? 'fixed', prizeValue: opts.prizeValue ?? 1000,
    maxTickets: opts.max ?? 100, drawIntervalMinutes: 30, theme: 'green',
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

// ---- signup via the HTTP API ----
export const GOOD_PASSWORD = 'Sup3r-Secret9';
/** A valid 10-digit mobile for a test username (numeric usernames that already look like one are used as-is). */
export const phoneFor = (username: string) =>
  /^[6-9]\d{9}$/.test(username) ? username : '9' + String([...username].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1_000_000_000, 7)).padStart(9, '0');

/** Signup needs a referral code: use the oldest account's (the seeded admin), creating a root user if the DB is empty. */
export async function rootReferralCode() {
  const [first] = await db.select({ code: users.referralCode }).from(users).orderBy(asc(users.id)).limit(1);
  return first?.code ?? (await makeUser(0)).referralCode;
}

/** Registers through the API. Returns the raw register response. */
export async function signup(
  base: string, username: string,
  o: { headers?: Record<string, string>; password?: string; name?: string; phone?: string; referralCode?: string } = {},
) {
  const phone = o.phone ?? phoneFor(username);
  const json = { 'Content-Type': 'application/json', ...o.headers };
  const referralCode = o.referralCode ?? await rootReferralCode();
  const res = await fetch(base + '/auth/register', {
    method: 'POST', headers: json,
    body: JSON.stringify({ username, name: o.name ?? 'Asha', phone, password: o.password ?? GOOD_PASSWORD, referralCode }),
  });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) as any };
}
