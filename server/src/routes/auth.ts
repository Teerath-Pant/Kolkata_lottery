import { Request, Response, Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { users } from '../db/schema';
import { assertSameClient, clearAuthCookies, cookieToken, setAuthCookies } from '../lib/cookies';
import { AppError, notFound } from '../lib/errors';
import { requireAuth } from '../middleware';
import { passwordProblem } from '../lib/password';
import { checkLogin, publicUser, registerUser } from '../services/account';
import { requestOtp } from '../services/otp';
import { endSession, rotateSession, startSession } from '../services/sessions';
import { walletSummary } from '../services/wallet';

export const authRouter = Router();

const username = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{4,20}$/, 'User ID must be 4-20 letters, digits or underscore');
// 10-digit Indian mobile number; "+91 98765 43210" style input is normalised to the bare 10 digits
const phone = z.string().trim().transform((v) => v.replace(/[\s-]/g, '').replace(/^(\+91|91)(?=\d{10}$)/, ''))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'));

/** Always sets the httpOnly cookies. Browser apps (X-Client header) get cookies only; other API clients also get the tokens in the body. */
function sendAuth(req: Request, res: Response, status: number, u: typeof users.$inferSelect, t: { accessToken: string; refreshToken: string }) {
  setAuthCookies(req, res, t);
  res.status(status).json({ user: publicUser(u), ...(req.get('x-client') ? {} : t) });
}

authRouter.post('/auth/otp/request', async (req, res) => {
  const b = z.object({ phone }).parse(req.body);
  res.json(await requestOtp(b.phone));
});

authRouter.post('/auth/register', async (req, res) => {
  const b = z.object({ username, name: z.string().trim().min(2).max(40), phone, otp: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'), password: z.string() })
    .superRefine((v, ctx) => {
      const problem = passwordProblem(v.password, { username: v.username, phone: v.phone });
      if (problem) ctx.addIssue({ code: 'custom', path: ['password'], message: problem });
    }).parse(req.body);
  const u = await registerUser(b);
  sendAuth(req, res, 201, u, await startSession(u));
});

authRouter.post('/auth/login', async (req, res) => {
  const b = z.object({ username, password: z.string().min(1) }).parse(req.body);
  const u = await checkLogin(b.username, b.password);
  sendAuth(req, res, 200, u, await startSession(u));
});

authRouter.post('/auth/refresh', async (req, res) => {
  const { refreshToken } = z.object({ refreshToken: z.string().min(1).optional() }).parse(req.body ?? {});
  let token = refreshToken;
  if (!token) {
    token = cookieToken(req, 'rt') ?? undefined;
    if (token) assertSameClient(req);
  }
  if (!token) throw new AppError(401, 'UNAUTHORIZED', 'Login required');
  const { user, tokens } = await rotateSession(token);
  sendAuth(req, res, 200, user, tokens);
});

authRouter.post('/auth/logout', async (req, res) => {
  const fromCookie = cookieToken(req, 'rt');
  if (fromCookie) assertSameClient(req);
  const { refreshToken } = z.object({ refreshToken: z.string().min(1).optional() }).parse(req.body ?? {});
  await endSession(refreshToken ?? fromCookie); // revoke server-side, not just forget the cookie
  clearAuthCookies(req, res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const [u] = await db.select().from(users).where(eq(users.id, req.user!.id));
  if (!u) throw notFound('User');
  const w = await walletSummary(u.id);
  res.json({ user: publicUser(u), balance: w.balance });
});
