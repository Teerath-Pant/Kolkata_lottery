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
  // paid to a new player's own bonus wallet when they sign up (0 = off)
  WELCOME_BONUS: z.coerce.number().int().min(0).default(50),
  // paid to the referrer's bonus wallet when a new player signs up with their code (0 = off)
  REFERRAL_BONUS: z.coerce.number().int().min(0).default(25),
  BUY_CUTOFF_SECONDS: z.coerce.number().int().min(0).default(30),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  ADMIN_USERNAME: z.string().default('admin'),
  ADMIN_PASSWORD: z.string().default('Admin@12345'),
  // number of reverse proxies in front of the server (0 = none: X-Forwarded-For is ignored, so IPs cannot be spoofed)
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  LOGIN_MAX_FAILURES: z.coerce.number().int().min(1).default(10),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).default(15),
  // signup OTP. `console` prints the code in the server log (dev only); `webhook` POSTs {to, message} to SMS_WEBHOOK_URL
  SMS_PROVIDER: z.enum(['console', 'webhook']).default('console'),
  SMS_WEBHOOK_URL: z.string().url().optional(),
  SMS_WEBHOOK_TOKEN: z.string().optional(),
  OTP_TTL_MINUTES: z.coerce.number().int().min(1).default(5),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  OTP_RESEND_SECONDS: z.coerce.number().int().min(0).default(60),
  OTP_MAX_SENDS_PER_HOUR: z.coerce.number().int().min(1).default(5),
  // largest single admin coin adjustment, and the largest balance a wallet may hold (keeps every amount a safe JS integer)
  ADMIN_MAX_ADJUST: z.coerce.number().int().min(1).default(1_000_000),
  WITHDRAW_MIN: z.coerce.number().int().min(1).default(100), // smallest withdrawal a player can ask for
  // how long GET /packages is served from memory (0 = always fresh)
  PACKAGES_CACHE_MS: z.coerce.number().int().min(0).default(2000),
});

export const config = schema.parse(process.env);

/** Things that must not reach production: placeholder secrets and the well-known default admin password. */
export function productionConfigProblems(c: z.infer<typeof schema>, env: NodeJS.ProcessEnv = process.env) {
  const problems: string[] = [];
  for (const k of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    if (c[k].length < 32 || /change-?me/i.test(c[k])) problems.push(`${k} must be a random string of at least 32 characters (not the .env.example placeholder)`);
  }
  if (c.JWT_ACCESS_SECRET === c.JWT_REFRESH_SECRET) problems.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  if (!env.ADMIN_PASSWORD) problems.push('ADMIN_PASSWORD must be set explicitly');
  else if (c.ADMIN_PASSWORD.length < 12 || c.ADMIN_PASSWORD === 'Admin@12345') problems.push('ADMIN_PASSWORD must be at least 12 characters and not the documented default');
  return problems;
}

if (config.NODE_ENV === 'production') {
  const problems = productionConfigProblems(config);
  if (problems.length) throw new Error(['Refusing to start in production:', ...problems].join('\n - '));
}

export const corsOrigins = config.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
