import { and, asc, eq, sql } from 'drizzle-orm';
import { Exec, db } from '../db';
import { draws, packages, tickets, users } from '../db/schema';
import { AppError, notFound } from '../lib/errors';
import { newSeed, sha256 } from '../lib/fair';

type Pkg = typeof packages.$inferSelect;
type Draw = typeof draws.$inferSelect;

/** Open a new draw for a package, snapshotting package rules and committing to a fresh seed. */
export async function openDraw(tx: Exec, pkg: Pkg, drawTime: Date) {
  const seed = newSeed();
  const [d] = await tx.insert(draws).values({
    packageId: pkg.id, drawTime, status: 'open', mode: 'random',
    ticketPrice: pkg.price, prizeType: pkg.prizeType, prizeValue: pkg.prizeValue,
    maxTickets: pkg.maxTickets,
    serverSeed: seed, serverSeedHash: sha256(seed),
  }).returning();
  return d;
}

/** First slot strictly after `after` on the package's interval grid anchored at `anchor`. */
export function nextDrawTime(anchor: Date, intervalMinutes: number, after: Date) {
  const step = intervalMinutes * 60_000;
  let t = anchor.getTime() + step;
  if (t <= after.getTime()) t += Math.ceil((after.getTime() - t + 1) / step) * step;
  return new Date(t);
}

const IST_OFFSET_MS = 330 * 60_000; // daily draw times are Indian Standard Time: UTC+5:30, no DST
const DAY_MS = 86_400_000;

/**
 * Next draw time for a package: the next daily HH:MM (IST) strictly after `after`,
 * or, for interval packages, the next slot on the interval grid anchored at `anchor`.
 */
export function nextDrawFor(pkg: Pick<Pkg, 'drawIntervalMinutes' | 'dailyTime'>, anchor: Date, after: Date) {
  if (pkg.dailyTime) {
    const [h, m] = pkg.dailyTime.split(':').map(Number);
    const istDayStart = Math.floor((after.getTime() + IST_OFFSET_MS) / DAY_MS) * DAY_MS;
    let t = istDayStart + (h * 60 + m) * 60_000 - IST_OFFSET_MS;
    if (t <= after.getTime()) t += DAY_MS;
    return new Date(t);
  }
  return nextDrawTime(anchor, pkg.drawIntervalMinutes!, after);
}

export const computePrize = (d: Pick<Draw, 'prizeType' | 'prizeValue' | 'ticketPrice'>, sold: number) =>
  d.prizeType === 'fixed' ? d.prizeValue : Math.floor((sold * d.ticketPrice * d.prizeValue) / 100);

const maskName = (n: string) => `${n.slice(0, 1)}***`;

/** Public view of a draw. The server seed is only exposed once the draw is finished. */
export async function publicDraw(drawId: number, viewerId?: number) {
  const [row] = await db.select({ d: draws, p: packages }).from(draws)
    .innerJoin(packages, eq(packages.id, draws.packageId)).where(eq(draws.id, drawId));
  if (!row) throw notFound('Draw');
  const { d, p } = row;
  const [{ sold }] = await db.select({ sold: sql<number>`count(*)::int` }).from(tickets).where(eq(tickets.drawId, d.id));
  let winnerName: string | null = null;
  if (d.winnerUserId) {
    const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, d.winnerUserId));
    winnerName = u ? maskName(u.name) : null;
  }
  const myTicketNos = viewerId
    ? (await db.select({ n: tickets.ticketNo }).from(tickets)
      .where(and(eq(tickets.drawId, d.id), eq(tickets.userId, viewerId))).orderBy(asc(tickets.ticketNo))).map((t) => t.n)
    : [];
  const finished = d.status === 'completed' || d.status === 'cancelled';
  return {
    id: d.id, packageId: d.packageId, packageName: p.name, theme: p.theme,
    status: d.status, mode: d.mode, drawTime: d.drawTime,
    ticketPrice: d.ticketPrice, prizeType: d.prizeType, prizeValue: d.prizeValue,
    prizeAmount: d.prizeAmount ?? computePrize(d, sold),
    maxTickets: d.maxTickets, soldCount: sold,
    serverSeedHash: d.serverSeedHash,
    serverSeed: finished ? d.serverSeed : null,
    winningTicketNo: d.winningTicketNo, winMethod: d.winMethod, winnerName,
    myTicketNos, iWon: !!viewerId && d.winnerUserId === viewerId,
    serverTime: new Date().toISOString(),
  };
}

/** Ticket numbers are random 6-digit values; max_tickets caps how many get sold. */
export const TICKET_MIN = 100000;
export const TICKET_MAX = 999999;
const OFFER_SLOTS = 10;

/**
 * Free numbers shown on the Pick grid. Slot k walks its own fixed pseudo-random sequence
 * sha256(seedHash:k:j), so the list is stable across polls and a sold number is replaced in the same slot.
 */
export function ticketOffers(seedHash: string, taken: Set<number>, count: number) {
  const out: number[] = [];
  for (let slot = 0; slot < count; slot++) {
    for (let j = 0; ; j++) {
      const n = TICKET_MIN + (parseInt(sha256(`${seedHash}:${slot}:${j}`).slice(0, 12), 16) % (TICKET_MAX - TICKET_MIN + 1));
      if (!taken.has(n) && !out.includes(n)) { out.push(n); break; }
    }
  }
  return out;
}

export async function takenNumbers(drawId: number) {
  const [d] = await db.select().from(draws).where(eq(draws.id, drawId));
  if (!d) throw notFound('Draw');
  const rows = await db.select({ n: tickets.ticketNo }).from(tickets).where(eq(tickets.drawId, drawId)).orderBy(asc(tickets.ticketNo));
  const taken = rows.map((r) => r.n);
  const offers = ticketOffers(d.serverSeedHash, new Set(taken), Math.min(OFFER_SLOTS, Math.max(0, d.maxTickets - taken.length)));
  return { drawId, maxTickets: d.maxTickets, taken, offers };
}

export async function verifyData(drawId: number) {
  const [d] = await db.select().from(draws).where(eq(draws.id, drawId));
  if (!d) throw notFound('Draw');
  if (d.status !== 'completed' && d.status !== 'cancelled') {
    throw new AppError(409, 'NOT_FINISHED', 'Draw not finished yet; seed is revealed after the draw');
  }
  const sold = await db.select({ n: tickets.ticketNo }).from(tickets).where(eq(tickets.drawId, drawId)).orderBy(asc(tickets.ticketNo));
  return {
    drawId: d.id, status: d.status, mode: d.mode, winMethod: d.winMethod,
    serverSeedHash: d.serverSeedHash, serverSeed: d.serverSeed,
    soldTickets: sold.map((s) => s.n), winningTicketNo: d.winningTicketNo,
    formula: 'winner = sortedSoldTickets[ HMAC_SHA256(key=serverSeed, message=String(drawId)) mod soldCount ]',
  };
}
