import { and, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../db';
import { refreshTokens, users } from '../db/schema';
import { signTokens, verifyToken } from '../lib/auth';
import { AppError } from '../lib/errors';

type User = typeof users.$inferSelect;

/**
 * A second use of the same refresh token inside this window is treated as a race (two tabs, a retried request)
 * and just gets a fresh token; after it, reuse means the token leaked and the whole family is revoked.
 */
export const REUSE_GRACE_MS = 10_000;

async function issue(user: Pick<User, 'id' | 'role'>, familyId?: string) {
  const t = signTokens(user, familyId);
  await db.insert(refreshTokens).values({ jti: t.refresh.jti, familyId: t.refresh.familyId, userId: user.id, expiresAt: t.refresh.expiresAt });
  return { accessToken: t.accessToken, refreshToken: t.refreshToken };
}

/** New login/registration = new token family. */
export const startSession = (user: User) => issue(user);

/** Exchanges a refresh token for a new access + refresh pair. The presented token can no longer be used. */
export async function rotateSession(refreshToken: string, now = new Date()) {
  const claims = verifyToken(refreshToken, 'refresh');
  const [revoked] = await db.update(refreshTokens).set({ revokedAt: now, rotatedAt: now })
    .where(and(eq(refreshTokens.jti, claims.jti), isNull(refreshTokens.revokedAt))).returning();

  if (!revoked) {
    const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.jti, claims.jti));
    // grace only for a token that was rotated a moment ago, and never once the login was logged out / revoked
    const [dead] = row ? await db.select({ jti: refreshTokens.jti }).from(refreshTokens)
      .where(and(eq(refreshTokens.familyId, row.familyId), isNotNull(refreshTokens.revokedAt), isNull(refreshTokens.rotatedAt))).limit(1) : [];
    const raceWithinGrace = !!row?.rotatedAt && !dead && now.getTime() - row.rotatedAt.getTime() <= REUSE_GRACE_MS && row.expiresAt > now;
    if (!raceWithinGrace) {
      await revokeFamily(claims.fam, now); // unknown or replayed token: kill every token of this login
      throw new AppError(401, 'UNAUTHORIZED', 'Session expired, please log in again');
    }
  } else if (revoked.expiresAt <= now) {
    throw new AppError(401, 'UNAUTHORIZED', 'Session expired, please log in again');
  }

  const [u] = await db.select().from(users).where(eq(users.id, claims.id));
  if (!u) throw new AppError(401, 'UNAUTHORIZED', 'Session expired, please log in again');
  return { user: u, tokens: await issue(u, claims.fam) };
}

export async function revokeFamily(familyId: string, now = new Date()) {
  await db.update(refreshTokens).set({ revokedAt: now })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
}

/** Logout: revoke the login the presented refresh token belongs to. Silent for missing/garbage tokens. */
export async function endSession(refreshToken?: string | null) {
  if (!refreshToken) return;
  try { await revokeFamily(verifyToken(refreshToken, 'refresh').fam); } catch { /* already invalid */ }
}

/** Housekeeping, called from the cron tick. */
export const purgeExpiredSessions = (now = new Date()) =>
  db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, sql`${now.toISOString()}::timestamptz - interval '1 day'`));
