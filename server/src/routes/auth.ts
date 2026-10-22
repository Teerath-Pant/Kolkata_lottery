import { Request, Response, Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { users } from '../db/schema';
import { signTokens, verifyToken } from '../lib/auth';
import { assertSameClient, clearAuthCookies, cookieToken, setAuthCookies } from '../lib/cookies';
import { AppError, notFound } from '../lib/errors';
import { requireAuth } from '../middleware';
import { checkLogin, createUser, publicUser } from '../services/account';
import { walletSummary } from '../services/wallet';

export const authRouter = Router();

const mobile = z.string().regex(/^\d{10}$/, 'Mobile must be 10 digits');
const password = z.string().min(6, 'Password must be at least 6 characters').max(72);

/** Always sets the httpOnly cookies. Browser apps (X-Client header) get cookies only; other API clients also get the tokens in the body. */
function sendAuth(req: Request, res: Response, status: number, u: typeof users.$inferSelect) {
  const t = signTokens(u);
  setAuthCookies(req, res, t);
  res.status(status).json({ user: publicUser(u), ...(req.get('x-client') ? {} : t) });
}

authRouter.post('/auth/register', async (req, res) => {
  const b = z.object({ mobile, name: z.string().trim().min(2).max(40), password }).parse(req.body);
  sendAuth(req, res, 201, await createUser(b));
});

authRouter.post('/auth/login', async (req, res) => {
  const b = z.object({ mobile, password: z.string().min(1) }).parse(req.body);
  sendAuth(req, res, 200, await checkLogin(b.mobile, b.password));
});

authRouter.post('/auth/refresh', async (req, res) => {
  const { refreshToken } = z.object({ refreshToken: z.string().min(1).optional() }).parse(req.body ?? {});
  let token = refreshToken;
  if (!token) {
    token = cookieToken(req, 'rt') ?? undefined;
    if (token) assertSameClient(req);
  }
  if (!token) throw new AppError(401, 'UNAUTHORIZED', 'Login required');
  const claims = verifyToken(token, 'refresh');
  const [u] = await db.select().from(users).where(eq(users.id, claims.id));
  if (!u) throw notFound('User');
  sendAuth(req, res, 200, u);
});

authRouter.post('/auth/logout', (req, res) => {
  clearAuthCookies(req, res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const [u] = await db.select().from(users).where(eq(users.id, req.user!.id));
  if (!u) throw notFound('User');
  const w = await walletSummary(u.id);
  res.json({ user: publicUser(u), balance: w.balance });
});
