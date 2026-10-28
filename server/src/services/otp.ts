import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { and, eq, sql } from 'drizzle-orm';
import { config } from '../config';
import { Tx, db } from '../db';
import { otpCodes, users } from '../db/schema';
import { AppError } from '../lib/errors';

export interface SmsSender { send(mobile: string, message: string): Promise<void> }

const consoleSender: SmsSender = {
  async send(mobile, message) { console.log(`[sms:console] to ${mobile}: ${message}`); },
};

/** Provider-agnostic: POSTs {to, message} as JSON; point SMS_WEBHOOK_URL at your SMS gateway / a small relay. */
const webhookSender: SmsSender = {
  async send(mobile, message) {
    const res = await fetch(config.SMS_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(config.SMS_WEBHOOK_TOKEN ? { Authorization: `Bearer ${config.SMS_WEBHOOK_TOKEN}` } : {}) },
      body: JSON.stringify({ to: mobile, message }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    if (!res?.ok) throw new AppError(502, 'SMS_FAILED', 'Could not send the OTP right now, please try again');
  },
};

let sender: SmsSender = config.SMS_PROVIDER === 'webhook' ? webhookSender : consoleSender;
/** Tests swap this to capture codes. */
export const setSmsSender = (s: SmsSender) => { sender = s; };

// the code is only ever stored as an HMAC, tied to the mobile number
const hashCode = (mobile: string, code: string) => createHmac('sha256', config.JWT_ACCESS_SECRET).update(`otp:${mobile}:${code}`).digest('hex');
const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Sends a fresh code to a mobile number that has no account yet. Resend cooldown and hourly cap apply per number. */
export async function requestOtp(mobile: string, now = new Date()) {
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.phone, mobile));
  if (taken) throw new AppError(409, 'PHONE_EXISTS', 'This mobile number is already registered. Please log in.');

  const [prev] = await db.select().from(otpCodes).where(eq(otpCodes.mobile, mobile));
  if (prev) {
    const wait = Math.ceil((prev.lastSentAt.getTime() + config.OTP_RESEND_SECONDS * 1000 - now.getTime()) / 1000);
    if (wait > 0) throw new AppError(429, 'OTP_COOLDOWN', `Please wait ${wait}s before requesting another code`);
    const sameHour = now.getTime() - prev.sendWindowStart.getTime() < 3_600_000;
    if (sameHour && prev.sends >= config.OTP_MAX_SENDS_PER_HOUR) throw new AppError(429, 'OTP_LIMIT', 'Too many codes requested for this number. Try again later.');
  }

  const code = String(randomInt(100000, 1_000_000));
  const newWindow = !prev || now.getTime() - prev.sendWindowStart.getTime() >= 3_600_000;
  const row = {
    codeHash: hashCode(mobile, code), expiresAt: new Date(now.getTime() + config.OTP_TTL_MINUTES * 60_000), attempts: 0,
    lastSentAt: now, sendWindowStart: newWindow ? now : prev!.sendWindowStart, sends: newWindow ? 1 : prev!.sends + 1,
  };
  await db.insert(otpCodes).values({ mobile, ...row }).onConflictDoUpdate({ target: otpCodes.mobile, set: row });
  await sender.send(mobile, `Your Lucky Ticket Draw verification code is ${code}. It expires in ${config.OTP_TTL_MINUTES} minutes. Do not share it.`);

  return {
    expiresInSeconds: config.OTP_TTL_MINUTES * 60,
    resendInSeconds: config.OTP_RESEND_SECONDS,
    // lets you finish signup locally without an SMS gateway; never sent when the provider is real or in production
    ...(config.SMS_PROVIDER === 'console' && config.NODE_ENV !== 'production' ? { devOtp: code } : {}),
  };
}

const INVALID = () => new AppError(400, 'OTP_INVALID', 'Wrong or expired code');

/**
 * Checks the code. Every try (right or wrong) is counted first, atomically, so parallel guesses cannot exceed
 * OTP_MAX_ATTEMPTS. Does not consume the code: that happens in the signup transaction (consumeOtp).
 */
export async function verifyOtp(mobile: string, code: string, now = new Date()) {
  const [row] = await db.update(otpCodes).set({ attempts: sql`${otpCodes.attempts} + 1` })
    .where(and(eq(otpCodes.mobile, mobile), sql`${otpCodes.expiresAt} > ${now.toISOString()}::timestamptz`, sql`${otpCodes.attempts} < ${config.OTP_MAX_ATTEMPTS}`))
    .returning();
  if (!row || !safeEqual(row.codeHash, hashCode(mobile, code))) throw INVALID();
  return row.codeHash;
}

/** Single use: deleted inside the signup transaction, so a code cannot create two accounts. */
export async function consumeOtp(tx: Tx, mobile: string, codeHash: string) {
  const gone = await tx.delete(otpCodes).where(and(eq(otpCodes.mobile, mobile), eq(otpCodes.codeHash, codeHash))).returning({ m: otpCodes.mobile });
  if (!gone.length) throw INVALID();
}

export const purgeExpiredOtps = (now = new Date()) =>
  db.delete(otpCodes).where(sql`${otpCodes.expiresAt} < ${now.toISOString()}::timestamptz - interval '1 day'`);
