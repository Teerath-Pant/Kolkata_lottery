import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { themeEnum } from '../db/schema';
import { requireAdmin } from '../middleware';
import {
  USER_SEARCH_FIELDS, USER_SORTS, adjustCoins, setUserBlocked, createPackage, dashboardSummary, deletePackage, listAudit, listDraws, listPackagesWithTiers, listUsers, listWinners, selectWinner, setPackageSalesWindow, usersReport,
  setTierPrizes, updatePackage,
} from '../services/admin';
import { getComplaintImages, listComplaints, setComplaintStatus } from '../services/complaints';
import { listDeposits, reviewDeposit } from '../services/deposits';
import { listWithdrawals, reviewWithdrawal } from '../services/withdrawals';
import { BULK_TICKETS_MAX, BULK_TICKETS_MIN, UPI_ID_RE, getBulkPlan, getUpi, setBulkPlan, setUpi } from '../services/settings';
import { liveTickets } from '../services/live';
import { BONUS_SORTS, LEDGER_TYPES, STATEMENT_MAX_EXPORT, bonusReport, walletStatement } from '../services/statement';

export const adminRouter = Router();
adminRouter.use('/admin', requireAdmin);

const id = z.coerce.number().int().positive();
const pkgBase = z.object({
  name: z.string().trim().min(1).max(40),
  price: z.number().int().positive().max(1_000_000),
  prizeType: z.enum(['fixed', 'pool_percent']),
  prizeValue: z.number().int().positive().max(1_000_000_000),
  maxTickets: z.number().int().min(1).max(9999),
  // schedule: exactly one of an interval in minutes, a daily time in IST, or a single run-once moment (checked below and in updatePackage)
  drawIntervalMinutes: z.number().int().positive().nullish(),
  dailyTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Daily time must be HH:MM').nullish(),
  runOnceAt: z.string().datetime({ offset: true }).nullish().transform((v) => (v == null ? v : new Date(v))),
  theme: z.enum(themeEnum.enumValues),
  isActive: z.boolean(),
});
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM');
// ticket buy window: daily HH:MM (IST), or one fixed start/end moment. Each pair is both-or-neither, and only one kind at a time
type BuyWin = { buyStartTime?: string | null; buyEndTime?: string | null; buyStartAt?: Date | null; buyEndAt?: Date | null };
const atTime = z.string().datetime({ offset: true }).transform((v) => new Date(v));
const buyFields = { buyStartTime: hhmm.nullish(), buyEndTime: hhmm.nullish(), buyStartAt: atTime.nullish(), buyEndAt: atTime.nullish() };
const buyChecks = <S extends z.ZodTypeAny>(schema: S) => schema.superRefine((v, ctx) => {
  const w = v as BuyWin;
  const bad = (message: string) => ctx.addIssue({ code: 'custom', message });
  if ((w.buyStartTime == null) !== (w.buyEndTime == null)) bad('Set both the start and the end time, or neither');
  else if (w.buyStartTime != null && w.buyStartTime === w.buyEndTime) bad('Start and end time must differ');
  if ((w.buyStartAt == null) !== (w.buyEndAt == null)) bad('Set both the start and the end date, or neither');
  else if (w.buyStartAt && w.buyEndAt && w.buyStartAt >= w.buyEndAt) bad('Buy end must be after the buy start');
  if (w.buyStartAt != null && w.buyStartTime != null) bad('Use either dates or a daily time window, not both');
}) as z.ZodEffects<S>;
const buyWindow = buyChecks(z.object(buyFields));
const pkgCreate = buyChecks(pkgBase.extend(buyFields).partial({ isActive: true }))
  .refine((p) => [p.drawIntervalMinutes, p.dailyTime, p.runOnceAt].filter((v) => v != null).length === 1, { message: 'Choose one schedule: repeat every N minutes, every day at a time, or run once' })
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
  res.status(201).json(await createPackage(req.user!.id, {
    ...b, drawIntervalMinutes: b.drawIntervalMinutes ?? null, dailyTime: b.dailyTime ?? null, runOnceAt: b.runOnceAt ?? null, isActive: b.isActive ?? true,
    buyStartTime: b.buyStartTime ?? null, buyEndTime: b.buyEndTime ?? null, buyStartAt: b.buyStartAt ?? null, buyEndAt: b.buyEndAt ?? null,
  }, req.ip));
});

// ticket buy window of a package (daily or fixed dates); not behind the "tickets already sold" edit lock
adminRouter.put('/admin/packages/:id/sales-window', async (req, res) => {
  const w = buyWindow.parse(req.body);
  res.json(await setPackageSalesWindow(req.user!.id, id.parse(req.params.id), {
    buyStartTime: w.buyStartTime ?? null, buyEndTime: w.buyEndTime ?? null, buyStartAt: w.buyStartAt ?? null, buyEndAt: w.buyEndAt ?? null,
  }, req.ip));
});

adminRouter.patch('/admin/packages/:id', async (req, res) => {
  const b = pkgBase.partial().parse(req.body);
  res.json(await updatePackage(req.user!.id, id.parse(req.params.id), b, req.ip));
});

adminRouter.delete('/admin/packages/:id', async (req, res) => {
  res.json(await deletePackage(req.user!.id, id.parse(req.params.id), req.ip));
});

adminRouter.get('/admin/draws', async (req, res) => {
  const q = z.object({
    status: z.enum(['open', 'drawing', 'completed', 'cancelled']).optional(),
    packageId: id.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  }).parse(req.query);
  res.json({ draws: await listDraws(q) });
});

adminRouter.post('/admin/draws/:id/select-winner', async (req, res) => {
  const { ticketNo } = z.object({ ticketNo: z.number().int().positive() }).parse(req.body);
  res.json(await selectWinner(req.user!.id, id.parse(req.params.id), ticketNo, req.ip));
});

adminRouter.post('/admin/users/:id/adjust-coins', async (req, res) => {
  const b = z.object({ amount: z.number().int().min(-config.ADMIN_MAX_ADJUST).max(config.ADMIN_MAX_ADJUST).refine((n) => n !== 0, 'amount must be non-zero'), reason: z.string().trim().min(3).max(200) }).parse(req.body);
  res.json(await adjustCoins(req.user!.id, id.parse(req.params.id), b.amount, b.reason, req.ip));
});

for (const [path, blocked] of [['block', true], ['unblock', false]] as const) {
  adminRouter.post(`/admin/users/:id/${path}`, async (req, res) => {
    const b = z.object({ reason: z.string().trim().max(200).default('') }).parse(req.body ?? {});
    res.json(await setUserBlocked(req.user!.id, id.parse(req.params.id), blocked, b.reason, req.ip));
  });
}

adminRouter.get('/admin/dashboard', async (_req, res) => res.json(await dashboardSummary()));
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');
// export=1 returns up to STATEMENT_MAX_EXPORT rows in one go, for the CSV download
adminRouter.get('/admin/wallet/statement', async (req, res) => {
  const q = z.object({
    search: z.string().trim().max(60).optional(),
    type: z.enum(LEDGER_TYPES).optional(),
    bonus: z.literal('1').optional(), // only bonus credits
    direction: z.enum(['credit', 'debit']).optional(),
    from: day.optional(),
    to: day.optional(),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    export: z.literal('1').optional(),
  }).parse(req.query);
  const { export: all, bonus, ...rest } = q;
  res.json(await walletStatement({ ...rest, bonus: bonus === '1', search: q.search || undefined, ...(all ? { page: 1, pageSize: STATEMENT_MAX_EXPORT } : {}) }));
});
adminRouter.get('/admin/live-tickets', async (req, res) => {
  const q = z.object({
    drawId: id.optional(),
    search: z.string().trim().max(60).optional(),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(48),
  }).parse(req.query);
  res.json(await liveTickets({ ...q, search: q.search || undefined }));
});

adminRouter.get('/admin/wallet/bonus', async (req, res) => {
  const q = z.object({
    search: z.string().trim().max(60).optional(),
    sort: z.enum(BONUS_SORTS).default('total'),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }).parse(req.query);
  res.json(await bonusReport({ ...q, search: q.search || undefined }));
});
adminRouter.get('/admin/users/report', async (req, res) => {
  const q = z.object({
    search: z.string().trim().max(60).optional(),
    searchBy: z.enum(USER_SEARCH_FIELDS).default('any'),
    joinedFrom: day.optional(),
    joinedTo: day.optional(),
    status: z.enum(['all', 'active', 'inactive', 'income', 'blocked']).default('all'),
    sort: z.enum(USER_SORTS).default('newest'),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }).parse(req.query);
  res.json(await usersReport({ ...q, search: q.search || undefined }));
});
adminRouter.get('/admin/users', async (_req, res) => res.json({ users: await listUsers() }));
adminRouter.get('/admin/winners', async (_req, res) => res.json({ winners: await listWinners() }));
adminRouter.get('/admin/audit-log', async (req, res) => {
  const q = z.object({
    action: z.string().max(64).optional(),
    adminId: id.optional(),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }).parse(req.query);
  res.json(await listAudit(q));
});

adminRouter.get('/admin/complaints', async (req, res) => {
  const q = z.object({
    status: z.enum(['open', 'resolved']).optional(),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }).parse(req.query);
  res.json(await listComplaints(q));
});

adminRouter.get('/admin/complaints/:id/images', async (req, res) => {
  res.json(await getComplaintImages(id.parse(req.params.id)));
});

adminRouter.patch('/admin/complaints/:id', async (req, res) => {
  const { status } = z.object({ status: z.enum(['open', 'resolved']) }).parse(req.body);
  res.json({ complaint: await setComplaintStatus(req.user!.id, id.parse(req.params.id), status, req.ip) });
});

adminRouter.get('/admin/deposits', async (req, res) => {
  const q = z.object({
    status: z.enum(['pending', 'approved', 'rejected', 'history']).optional(), // history = approved + rejected
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }).parse(req.query);
  res.json(await listDeposits(q));
});

adminRouter.patch('/admin/deposits/:id', async (req, res) => {
  const { status } = z.object({ status: z.enum(['approved', 'rejected']) }).parse(req.body);
  res.json({ deposit: await reviewDeposit(req.user!.id, id.parse(req.params.id), status, req.ip) });
});

adminRouter.get('/admin/withdrawals', async (req, res) => {
  const q = z.object({
    status: z.enum(['pending', 'approved', 'rejected', 'history']).optional(), // history = approved + rejected
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }).parse(req.query);
  res.json(await listWithdrawals(q));
});

adminRouter.patch('/admin/withdrawals/:id', async (req, res) => {
  const b = z.object({
    status: z.enum(['approved', 'rejected']),
    payoutRef: z.string().trim().max(40).optional(),
    note: z.string().trim().max(200).optional(),
  }).parse(req.body);
  res.json({ withdrawal: await reviewWithdrawal(req.user!.id, id.parse(req.params.id), b.status, { payoutRef: b.payoutRef, note: b.note }, req.ip) });
});

adminRouter.get('/admin/settings/upi', async (_req, res) => res.json(await getUpi()));

adminRouter.put('/admin/settings/upi', async (req, res) => {
  const b = z.object({
    upiId: z.string().trim().max(100).refine((v) => v === '' || UPI_ID_RE.test(v), 'UPI ID must look like name@bank'),
    payeeName: z.string().trim().min(1).max(60),
  }).parse(req.body);
  res.json(await setUpi(req.user!.id, { upiId: b.upiId || null, payeeName: b.payeeName }, req.ip));
});

adminRouter.get('/admin/settings/bulk-plan', async (_req, res) => res.json(await getBulkPlan()));

adminRouter.put('/admin/settings/bulk-plan', async (req, res) => {
  const b = z.object({
    enabled: z.boolean(),
    tickets: z.number().int().min(BULK_TICKETS_MIN).max(BULK_TICKETS_MAX),
    bonus: z.number().int().min(1).max(config.ADMIN_MAX_ADJUST),
  }).parse(req.body);
  res.json(await setBulkPlan(req.user!.id, b, req.ip));
});
