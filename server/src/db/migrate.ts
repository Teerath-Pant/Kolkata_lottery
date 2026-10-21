import path from 'path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './index';

export const migrationsFolder = path.resolve(__dirname, '../../drizzle');

export async function runMigrations() {
  await migrate(db, { migrationsFolder });
}

if (require.main === module) {
  runMigrations()
    .then(() => console.log('migrations applied'))
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => pool.end());
}
