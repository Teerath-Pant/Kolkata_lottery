import { createHash, createHmac } from 'crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db';
import { draws } from '../src/db/schema';
import { newSeed, pickWinner, sha256 } from '../src/lib/fair';
import { verifyData } from '../src/services/draws';
import { executeDraw } from '../src/services/drawJob';
import { AppError } from '../src/lib/errors';
import { closePool, makeDraw, resetDb, sellTickets } from './helpers';

beforeEach(resetDb);
afterAll(closePool);

// independent re-implementation, exactly what the public Verify page does
function verifyIndependently(v: { serverSeed: string; serverSeedHash: string; drawId: number; soldTickets: number[]; winningTicketNo: number }) {
  const hashOk = createHash('sha256').update(v.serverSeed).digest('hex') === v.serverSeedHash;
  const hmac = createHmac('sha256', v.serverSeed).update(String(v.drawId)).digest('hex');
  const idx = Number(BigInt('0x' + hmac) % BigInt(v.soldTickets.length));
  return hashOk && [...v.soldTickets].sort((a, b) => a - b)[idx] === v.winningTicketNo;
}

describe('provably fair', () => {
  it('seed hash commits to seed; winner is deterministic and among sold tickets', () => {
    const seed = newSeed();
    expect(seed).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256(seed)).toBe(createHash('sha256').update(seed).digest('hex'));
    const sold = [42, 3, 17, 99, 8];
    const a = pickWinner(seed, 5, sold);
    const b = pickWinner(seed, 5, [...sold].reverse()); // input order must not matter
    expect(a.ticketNo).toBe(b.ticketNo);
    expect(sold).toContain(a.ticketNo);
    expect(pickWinner(seed, 6, sold).hmac).not.toBe(a.hmac); // draw id is part of the message
  });

  it('known vector', () => {
    const r = pickWinner('seed', 1, [1, 2, 3]);
    const hmac = createHmac('sha256', 'seed').update('1').digest('hex');
    expect(r.hmac).toBe(hmac);
    expect(r.index).toBe(Number(BigInt('0x' + hmac) % 3n));
  });

  it('winner distribution is roughly uniform', () => {
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 4000; i++) counts[pickWinner(newSeed(), i, [1, 2, 3, 4]).index]++;
    for (const c of counts) expect(c).toBeGreaterThan(800);
  });

  it('seed stays hidden until the draw finishes, then anyone can recompute the result', async () => {
    const { draw } = await makeDraw({ min: 0, drawTime: new Date(Date.now() - 60_000) });
    await sellTickets(draw.id, 50, 12);
    await db.update(draws).set({ status: 'open' }).where(eq(draws.id, draw.id));

    await db.update(draws).set({ drawTime: new Date(Date.now() + 3600_000) }).where(eq(draws.id, draw.id));
    await expect(verifyData(draw.id)).rejects.toBeInstanceOf(AppError);

    await db.update(draws).set({ drawTime: new Date(Date.now() - 1000) }).where(eq(draws.id, draw.id));
    await executeDraw(draw.id);
    const v = await verifyData(draw.id);
    expect(v.winMethod).toBe('random');
    expect(verifyIndependently(v as any)).toBe(true);
    // tampering must be detected
    expect(verifyIndependently({ ...(v as any), winningTicketNo: ((v.winningTicketNo as number) % 12) + 1 })).toBe(false);
    expect(verifyIndependently({ ...(v as any), serverSeed: newSeed() })).toBe(false);
  });
});
