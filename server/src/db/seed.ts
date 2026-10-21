import { eq } from 'drizzle-orm';
import { config } from '../config';
import { db, pool } from './index';
import { packages, users, wallets } from './schema';
import { hashPassword } from '../services/account';
import { nextDrawTime, openDraw } from '../services/draws';

const PACKAGES = [
  { name: 'Green 50', price: 50, theme: 'green', prizeType: 'fixed', prizeValue: 2000, maxTickets: 100, minTickets: 5, drawIntervalMinutes: 30 },
  { name: 'Red 100', price: 100, theme: 'red', prizeType: 'pool_percent', prizeValue: 80, maxTickets: 100, minTickets: 5, drawIntervalMinutes: 30 },
  { name: 'Blue 200', price: 200, theme: 'blue', prizeType: 'fixed', prizeValue: 10000, maxTickets: 100, minTickets: 3, drawIntervalMinutes: 30 },
] as const;

export async function seed() {
  await db.transaction(async (tx) => {
    const [admin] = await tx.select().from(users).where(eq(users.mobile, config.ADMIN_MOBILE));
    if (!admin) {
      const [u] = await tx.insert(users).values({
        mobile: config.ADMIN_MOBILE, name: 'Admin', role: 'admin', passwordHash: await hashPassword(config.ADMIN_PASSWORD),
      }).returning();
      await tx.insert(wallets).values({ userId: u.id, balance: 0 });
    }
    const existing = await tx.select().from(packages);
    for (const p of PACKAGES) {
      if (existing.some((e) => e.price === p.price)) continue; // idempotent
      const [pkg] = await tx.insert(packages).values({ ...p }).returning();
      const now = new Date();
      await openDraw(tx, pkg, nextDrawTime(now, pkg.drawIntervalMinutes, now));
    }
  });
}

if (require.main === module) {
  seed()
    .then(() => console.log(`seeded. admin login: ${config.ADMIN_MOBILE} / ${config.ADMIN_PASSWORD}`))
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => pool.end());
}
