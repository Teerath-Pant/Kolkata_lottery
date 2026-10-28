import path from 'path';
import dotenv from 'dotenv';

// the real .env lives in the repo root (same as src/config.ts); the cwd one is a fallback
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/lucky_draw' },
});
