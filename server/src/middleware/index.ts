import { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { ZodError } from 'zod';
import { db } from '../db';
import { users } from '../db/schema';
import { verifyToken } from '../lib/auth';
import { assertSameClient, cookieToken } from '../lib/cookies';
import { AppError } from '../lib/errors';

declare global {
  namespace Express {
    interface Request { user?: { id: number; role: 'user' | 'admin' } }
  }
}

/** Bearer header (API clients) wins; otherwise the httpOnly cookie the browser apps use. */
function accessToken(req: Request) {
  if (req.headers.authorization?.startsWith('Bearer ')) return req.headers.authorization.slice(7);
  const c = cookieToken(req, 'at');
  if (c) assertSameClient(req);
  return c;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const t = accessToken(req);
  if (!t) throw new AppError(401, 'UNAUTHORIZED', 'Login required');
  req.user = verifyToken(t, 'access');
  next();
}

/** Sets req.user when a valid token is sent, never rejects. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const t = accessToken(req);
  if (t) { try { req.user = verifyToken(t, 'access'); } catch { /* anonymous */ } }
  next();
}

/** Role is re-read from the DB so a demoted admin loses access immediately. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => undefined);
  const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, req.user!.id));
  if (u?.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'Admin only');
  next();
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: { code: 'VALIDATION', message: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') } });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
}
