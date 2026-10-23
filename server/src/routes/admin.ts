import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { requireAdmin } from '../middleware';
import {
  adjustCoins, createPackage, listAudit, listDraws, listPackagesWithTiers, listUsers, listWinners, selectWinner, setMode,
  setTierPrizes, updatePackage,
} from '../services/admin';

export const adminRouter = Router();
adminRouter.use('/admin', requireAdmin);

const id = z.coerce.number().int().positive();
const pkgBase = z.object({
  name: z.string().trim().min(1).max(40),
  price: z.number().int().positive().max(1_000_000),
  prizeType: z.enum(['fixed', 'pool_percent']),
  prizeValue: z.number().int().positive().max(1_000_000_000),
  maxTickets: z.number().int().min(1).max(9999),
  // schedule: either an interval in minutes or a daily time in IST, never both (checked below and in updatePackage)
  drawIntervalMinutes: z.number().int().positive().nullish(),
  dailyTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Daily time must be HH:MM').nullish(),
  theme: z.enum(['green', 'red', 'blue', 'purple', 'pink']),
  isActive: z.boolean(),
});
const pkgCreate = pkgBase.partial({ isActive: true })
  .refine((p) => (p.drawIntervalMinutes != null) !== (p.dailyTime != null), { message: 'Choose either an interval or a daily time, not both' })
  .refine((p) => p.prizeType !== 'pool_percent' || p.prizeValue <= 100, { message: 'percent prize must be <= 100' });

adminRouter.get('/admin/packages', async (_req, res) => {
  res.json({ packages: await listPackagesWithTiers() });
});

adminRouter.put('/admin/packages/:id/tier-prizes', async (req, res) => {
  const { prizes } = z.object({
    prizes: z.array(z.object({ matchDigits: z.number().int().min(1).max(5), prize: z.number().int().min(0).max(1_000_000_000) })).min(1).max(5)
      .refine((a) => new Set(a.map((p) => p.matchDigits)).size === a.length, 'duplicate matchDigits'),
  }).parse(req.body);
  res.json(await setTierPrizes(req.user!.id, id.parse(req.params.id), prizes, req.ip));
});

adminRouter.post('/admin/packages', async (req, res) => {
  const b = pkgCreate.parse(req.body);
  res.status(201).json(await createPackage(req.user!.id, { ...b, drawIntervalMinutes: b.drawIntervalMinutes ?? null, dailyTime: b.dailyTime ?? null, isActive: b.isActive ?? true }, req.ip));
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
  const b = z.object({ amount: z.number().int().min(-config.ADMIN_MAX_ADJUST).max(config.ADMIN_MAX_ADJUST).refine((n) => n !== 0, 'amount must be non-zero'), reason: z.string().trim().min(3).max(200) }).parse(req.body);
  res.json(await adjustCoins(req.user!.id, id.parse(req.params.id), b.amount, b.reason, req.ip));
});

adminRouter.get('/admin/users', async (_req, res) => res.json({ users: await listUsers() }));
adminRouter.get('/admin/winners', async (_req, res) => res.json({ winners: await listWinners() }));
adminRouter.get('/admin/audit-log', async (_req, res) => res.json({ log: await listAudit() }));
