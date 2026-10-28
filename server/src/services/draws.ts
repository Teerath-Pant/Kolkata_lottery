import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { Exec, db } from '../db';
import { config } from '../config';
import { drawTierPrizes, drawTierWinners, draws, packageTierPrizes, packages, tickets, users } from '../db/schema';
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
  await snapshotTierPrizes(tx, d.id, pkg.id);
  return d;
}

/** Copy the package's current tier prizes onto the draw so later edits only affect future draws. */
export async function snapshotTierPrizes(tx: Exec, drawId: number, packageId: number) {
  const rows = await tx.select().from(packageTierPrizes).where(eq(packageTierPrizes.packageId, packageId));
  if (rows.length) {
    await tx.insert(drawTierPrizes).values(rows.map((r) => ({ drawId, matchDigits: r.matchDigits, prize: r.prize })))
      .onConflictDoNothing();
  }
}

/** Upsert the package's tier prizes (admin-defined; 0 disables a tier). */
export async function saveTierPrizes(tx: Exec, packageId: number, prizes: { matchDigits: number; prize: number }[]) {
  for (const p of prizes) {
    await tx.insert(packageTierPrizes).values({ packageId, ...p })
      .onConflictDoUpdate({ target: [packageTierPrizes.packageId, packageTierPrizes.matchDigits], set: { prize: p.prize } });
  }
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

/** Everything about a draw that is the same for every viewer (safe to cache briefly). */
async function baseDraws(ids: number[]) {
  const out = new Map<number, { view: ReturnType<typeof baseView>; winnerUserId: number | null }>();
  if (!ids.length) return out;
  // 5 queries for any number of draws (the /packages page used to run ~6 per draw)
  const rows = await db.select({ d: draws, p: packages }).from(draws)
    .innerJoin(packages, eq(packages.id, draws.packageId)).where(inArray(draws.id, ids));
  const sold = await db.select({ drawId: tickets.drawId, n: sql<number>`count(*)::int` }).from(tickets)
    .where(inArray(tickets.drawId, ids)).groupBy(tickets.drawId);
  const tierRows = await db.select().from(drawTierPrizes).where(inArray(drawTierPrizes.drawId, ids));
  const tierWinners = await db.select({ drawId: drawTierWinners.drawId, k: drawTierWinners.matchDigits, n: sql<number>`count(*)::int` })
    .from(drawTierWinners).where(inArray(drawTierWinners.drawId, ids)).groupBy(drawTierWinners.drawId, drawTierWinners.matchDigits);
  const winnerIds = [...new Set(rows.map((r) => r.d.winnerUserId).filter((x): x is number => x !== null))];
  const names = winnerIds.length
    ? new Map((await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, winnerIds))).map((u) => [u.id, u.name]))
    : new Map<number, string>();

  for (const { d, p } of rows) {
    const soldCount = sold.find((x) => x.drawId === d.id)?.n ?? 0;
    const tiers = tierRows.filter((t) => t.drawId === d.id).sort((x, y) => y.matchDigits - x.matchDigits).map((t) => ({
      matchDigits: t.matchDigits, prize: t.prize,
      winners: d.status === 'completed' ? (tierWinners.find((w) => w.drawId === d.id && w.k === t.matchDigits)?.n ?? 0) : null,
    }));
    const winnerName = d.winnerUserId ? names.get(d.winnerUserId) : undefined;
    out.set(d.id, { winnerUserId: d.winnerUserId, view: baseView(d, p, soldCount, tiers, winnerName ?? null) });
  }
  return out;
}

function baseView(d: Draw, p: Pkg, sold: number, tiers: { matchDigits: number; prize: number; winners: number | null }[], winnerName: string | null) {
  const finished = d.status === 'completed' || d.status === 'cancelled';
  return {
    id: d.id, packageId: d.packageId, packageName: p.name, theme: p.theme,
    status: d.status, mode: d.mode, drawTime: d.drawTime,
    ticketPrice: d.ticketPrice, prizeType: d.prizeType, prizeValue: d.prizeValue,
    prizeAmount: d.prizeAmount ?? computePrize(d, sold),
    maxTickets: d.maxTickets, soldCount: sold,
    serverSeedHash: d.serverSeedHash,
    serverSeed: finished ? d.serverSeed : null, // the seed is only exposed once the draw is finished
    winningTicketNo: d.winningTicketNo, winMethod: d.winMethod, winnerName, completedAt: d.completedAt,
    tiers,
  };
}

type Base = Awaited<ReturnType<typeof baseDraws>>;

/** The viewer-specific part: their own ticket numbers and consolation prize. 2 queries for any number of draws. */
async function withViewer(ids: number[], base: Base, viewerId?: number) {
  const mine = new Map<number, number[]>();
  const tier = new Map<number, { matchDigits: number; prize: number }>();
  if (viewerId && ids.length) {
    for (const t of await db.select({ drawId: tickets.drawId, n: tickets.ticketNo }).from(tickets)
      .where(and(inArray(tickets.drawId, ids), eq(tickets.userId, viewerId))).orderBy(asc(tickets.ticketNo))) {
      mine.set(t.drawId, [...(mine.get(t.drawId) ?? []), t.n]);
    }
    for (const t of await db.select({ drawId: drawTierWinners.drawId, matchDigits: drawTierWinners.matchDigits, prize: drawTierWinners.prize })
      .from(drawTierWinners).where(and(inArray(drawTierWinners.drawId, ids), eq(drawTierWinners.userId, viewerId)))) {
      const prev = tier.get(t.drawId); // several winning tickets: best match shown, prizes summed
      tier.set(t.drawId, { matchDigits: Math.max(prev?.matchDigits ?? 0, t.matchDigits), prize: (prev?.prize ?? 0) + t.prize });
    }
  }
  const serverTime = new Date().toISOString(); // always fresh, even when `base` came from the cache: countdowns rely on it
  return ids.flatMap((id) => {
    const b = base.get(id);
    return b ? [{ ...b.view, myTicketNos: mine.get(id) ?? [], myTier: tier.get(id) ?? null, iWon: !!viewerId && b.winnerUserId === viewerId, serverTime }] : [];
  });
}

/** Public view of a draw. The server seed is only exposed once the draw is finished. */
export async function publicDraw(drawId: number, viewerId?: number) {
  const [d] = await withViewer([drawId], await baseDraws([drawId]), viewerId);
  if (!d) throw notFound('Draw');
  return d;
}

// GET /packages is public and polled by every open home screen: build the viewer-independent part once per
// PACKAGES_CACHE_MS and share it (also while it is still loading), then add the viewer's own data on top.
let packagesCache: { at: number; value: Promise<{ pkgs: Pkg[]; open: Map<number, number>; base: Base }> } | null = null;
export const invalidatePublicCache = () => { packagesCache = null; };

async function loadPackagesBase() {
  const pkgs = await db.select().from(packages).where(eq(packages.isActive, true)).orderBy(packages.price);
  const openRows = pkgs.length
    ? await db.select({ id: draws.id, packageId: draws.packageId }).from(draws)
      .where(and(eq(draws.status, 'open'), inArray(draws.packageId, pkgs.map((p) => p.id))))
    : [];
  const open = new Map(openRows.map((r) => [r.packageId, r.id]));
  return { pkgs, open, base: await baseDraws([...open.values()]) };
}

export async function publicPackages(viewerId?: number) {
  const ttl = config.PACKAGES_CACHE_MS;
  if (!packagesCache || ttl <= 0 || Date.now() - packagesCache.at > ttl) {
    const entry = { at: Date.now(), value: loadPackagesBase() };
    packagesCache = entry;
    entry.value.catch(() => { if (packagesCache === entry) packagesCache = null; });
  }
  const { pkgs, open, base } = await packagesCache.value;
  const ids = [...open.values()];
  const views = new Map((await withViewer(ids, base, viewerId)).map((v) => [v.id, v]));
  return pkgs.map((p) => ({ ...p, currentDraw: views.get(open.get(p.id) ?? -1) ?? null }));
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
