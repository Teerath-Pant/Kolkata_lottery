import { Router } from 'express';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { drawTierWinners, draws, packages, tickets, users } from '../db/schema';
import { notFound } from '../lib/errors';
import { optionalAuth, requireAuth } from '../middleware';
import { buyTicket } from '../services/buy';
import { publicDraw, publicPackages, takenNumbers, verifyData } from '../services/draws';
import { walletSummary } from '../services/wallet';

export const gameRouter = Router();
const id = z.coerce.number().int().positive();

async function currentDraw(packageId: number) {
  const [d] = await db.select({ id: draws.id }).from(draws)
    .where(and(eq(draws.packageId, packageId), eq(draws.status, 'open')));
  return d?.id ?? null;
}

gameRouter.get('/packages', optionalAuth, async (req, res) => {
  res.json({ packages: await publicPackages(req.user?.id), serverTime: new Date().toISOString() });
});

gameRouter.get('/packages/:id/current-draw', optionalAuth, async (req, res) => {
  const pid = id.parse(req.params.id);
  const [p] = await db.select().from(packages).where(eq(packages.id, pid));
  if (!p) throw notFound('Package');
  const did = await currentDraw(pid);
  if (!did) throw notFound('Open draw');
  res.json(await publicDraw(did, req.user?.id));
});

gameRouter.get('/draws/:id', optionalAuth, async (req, res) => {
  res.json(await publicDraw(id.parse(req.params.id), req.user?.id));
});

gameRouter.get('/draws/:id/tickets', async (req, res) => {
  res.json(await takenNumbers(id.parse(req.params.id)));
});

gameRouter.get('/draws/:id/verify', async (req, res) => {
  res.json(await verifyData(id.parse(req.params.id)));
});

const buySchema = z.object({ ticketNo: z.number().int().positive().optional(), random: z.boolean().optional() })
  .refine((b) => (b.random === true) !== (b.ticketNo !== undefined), { message: 'Send either random:true or ticketNo' });

gameRouter.post('/draws/:id/buy', requireAuth, async (req, res) => {
  const body = buySchema.parse(req.body);
  const key = z.string().min(8).max(100).optional().parse(req.header('Idempotency-Key'));
  res.status(201).json(await buyTicket(req.user!.id, id.parse(req.params.id), body, key));
});

gameRouter.get('/me/tickets', requireAuth, async (req, res) => {
  const rows = await db.select({
    ticketId: tickets.id, drawId: draws.id, ticketNo: tickets.ticketNo, createdAt: tickets.createdAt,
    packageName: packages.name, theme: packages.theme, price: draws.ticketPrice, status: draws.status, mode: draws.mode,
    drawTime: draws.drawTime, winningTicketNo: draws.winningTicketNo, prizeAmount: draws.prizeAmount,
    won: sql<boolean>`${draws.winnerUserId} = ${tickets.userId}`,
    matchDigits: drawTierWinners.matchDigits, tierPrize: drawTierWinners.prize,
  }).from(tickets).innerJoin(draws, eq(draws.id, tickets.drawId)).innerJoin(packages, eq(packages.id, draws.packageId))
    .leftJoin(drawTierWinners, and(eq(drawTierWinners.drawId, tickets.drawId), eq(drawTierWinners.userId, tickets.userId)))
    .where(eq(tickets.userId, req.user!.id)).orderBy(desc(tickets.createdAt)).limit(200);
  res.json({ tickets: rows });
});

gameRouter.get('/me/wallet', requireAuth, async (req, res) => res.json(await walletSummary(req.user!.id)));

gameRouter.get('/results', async (req, res) => {
  const q = z.object({
    packageId: id.optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }).parse(req.query);
  const start = q.date ? new Date(`${q.date}T00:00:00.000Z`) : null;
  const rows = await db.select({
    drawId: draws.id, packageId: draws.packageId, packageName: packages.name, theme: packages.theme,
    drawTime: draws.drawTime, status: draws.status, mode: draws.mode, winMethod: draws.winMethod,
    winningTicketNo: draws.winningTicketNo, prizeAmount: draws.prizeAmount, winnerName: users.name,
  }).from(draws).innerJoin(packages, eq(packages.id, draws.packageId)).leftJoin(users, eq(users.id, draws.winnerUserId))
    .where(and(
      sql`${draws.status} IN ('completed','cancelled')`,
      q.packageId ? eq(draws.packageId, q.packageId) : undefined,
      start ? gte(draws.drawTime, start) : undefined,
      start ? lt(draws.drawTime, new Date(start.getTime() + 86_400_000)) : undefined,
    )).orderBy(desc(draws.drawTime)).limit(q.limit);
  res.json({ results: rows.map((r) => ({ ...r, winnerName: r.winnerName ? `${r.winnerName.slice(0, 1)}***` : null })) });
});
