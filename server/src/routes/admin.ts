import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { packages } from '../db/schema';
import { requireAdmin } from '../middleware';
import {
  adjustCoins, createPackage, listAudit, listDraws, listUsers, selectWinner, setMode, updatePackage,
} from '../services/admin';

export const adminRouter = Router();
adminRouter.use('/admin', requireAdmin);

const id = z.coerce.number().int().positive();
const pkgBase = z.object({
  name: z.string().trim().min(1).max(40),
  price: z.number().int().positive(),
  prizeType: z.enum(['fixed', 'pool_percent']),
  prizeValue: z.number().int().positive(),
  maxTickets: z.number().int().min(1).max(9999),
  minTickets: z.number().int().min(0),
  drawIntervalMinutes: z.number().int().positive(),
  theme: z.enum(['green', 'red', 'blue']),
  isActive: z.boolean(),
});
const pkgCreate = pkgBase.partial({ isActive: true, minTickets: true })
  .refine((p) => (p.minTickets ?? 0) <= p.maxTickets, { message: 'minTickets must be <= maxTickets' })
  .refine((p) => p.prizeType !== 'pool_percent' || p.prizeValue <= 100, { message: 'percent prize must be <= 100' });

adminRouter.get('/admin/packages', async (_req, res) => {
  res.json({ packages: await db.select().from(packages).orderBy(packages.price) });
});

adminRouter.post('/admin/packages', async (req, res) => {
  const b = pkgCreate.parse(req.body);
  res.status(201).json(await createPackage(req.user!.id, { ...b, minTickets: b.minTickets ?? 0, isActive: b.isActive ?? true }, req.ip));
});

adminRouter.patch('/admin/packages/:id', async (req, res) => {
  const b = pkgBase.partial().parse(req.body);
  res.json(await updatePackage(req.user!.id, id.parse(req.params.id), b, req.ip));
});

adminRouter.get('/admin/draws', async (req, res) => {
  const q = z.object({
    status: z.enum(['open', 'drawing', 'completed', 'cancelled']).optional(),
    packageId: id.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  }).parse(req.query);
  res.json({ draws: await listDraws(q) });
});

adminRouter.post('/admin/draws/:id/mode', async (req, res) => {
  const { mode } = z.object({ mode: z.enum(['random', 'admin_selected']) }).parse(req.body);
  res.json(await setMode(req.user!.id, id.parse(req.params.id), mode, req.ip));
});

adminRouter.post('/admin/draws/:id/select-winner', async (req, res) => {
  const { ticketNo } = z.object({ ticketNo: z.number().int().positive() }).parse(req.body);
  res.json(await selectWinner(req.user!.id, id.parse(req.params.id), ticketNo, req.ip));
});

adminRouter.post('/admin/users/:id/adjust-coins', async (req, res) => {
  const b = z.object({ amount: z.number().int().refine((n) => n !== 0, 'amount must be non-zero'), reason: z.string().trim().min(3).max(200) }).parse(req.body);
  res.json(await adjustCoins(req.user!.id, id.parse(req.params.id), b.amount, b.reason, req.ip));
});

adminRouter.get('/admin/users', async (_req, res) => res.json({ users: await listUsers() }));
adminRouter.get('/admin/audit-log', async (_req, res) => res.json({ log: await listAudit() }));
