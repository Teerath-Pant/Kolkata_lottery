import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Tests need a real Postgres (row locks + unique constraints are what we are testing).
 * If TEST_DATABASE_URL is set it is used as-is, otherwise a throwaway embedded Postgres is started.
 */
export default async function setup() {
  if (process.env.TEST_DATABASE_URL) return;
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucky-pg-'));
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port: 54329, persistent: false });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lucky_test');
  return async () => {
    await pg.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  };
}
