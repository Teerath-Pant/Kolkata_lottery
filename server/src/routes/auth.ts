import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { users } from '../db/schema';
import { signTokens, verifyToken } from '../lib/auth';
import { notFound } from '../lib/errors';
import { requireAuth } from '../middleware';
import { checkLogin, createUser, publicUser } from '../services/account';
import { walletSummary } from '../services/wallet';

export const authRouter = Router();

const mobile = z.string().regex(/^\d{10}$/, 'Mobile must be 10 digits');
const password = z.string().min(6, 'Password must be at least 6 characters').max(72);

authRouter.post('/auth/register', async (req, res) => {
  const b = z.object({ mobile, name: z.string().trim().min(2).max(40), password }).parse(req.body);
  const u = await createUser(b);
  res.status(201).json({ user: publicUser(u), ...signTokens(u) });
});

authRouter.post('/auth/login', async (req, res) => {
  const b = z.object({ mobile, password: z.string().min(1) }).parse(req.body);
  const u = await checkLogin(b.mobile, b.password);
  res.json({ user: publicUser(u), ...signTokens(u) });
});

authRouter.post('/auth/refresh', async (req, res) => {
  const { refreshToken } = z.object({ refreshToken: z.string().min(1) }).parse(req.body);
  const claims = verifyToken(refreshToken, 'refresh');
  const [u] = await db.select().from(users).where(eq(users.id, claims.id));
  if (!u) throw notFound('User');
  res.json({ user: publicUser(u), ...signTokens(u) });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const [u] = await db.select().from(users).where(eq(users.id, req.user!.id));
  if (!u) throw notFound('User');
  const w = await walletSummary(u.id);
  res.json({ user: publicUser(u), balance: w.balance });
});
