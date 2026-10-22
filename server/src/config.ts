import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ACCESS_TTL: z.string().default('15m'),
  REFRESH_TTL: z.string().default('30d'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  RUN_CRON: z.string().default('true'),
  SIGNUP_BONUS: z.coerce.number().int().min(0).default(500),
  BUY_CUTOFF_SECONDS: z.coerce.number().int().min(0).default(30),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  ADMIN_MOBILE: z.string().default('9999999999'),
  ADMIN_PASSWORD: z.string().default('Admin@12345'),
});

export const config = schema.parse(process.env);
export const corsOrigins = config.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
