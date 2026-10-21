import type { VerifyData } from './types';

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

/** Recompute everything in the browser with WebCrypto; nothing here trusts the server's claimed winner. */
export async function verifyDraw(v: VerifyData) {
  const hash = hex(await crypto.subtle.digest('SHA-256', enc.encode(v.serverSeed)));
  const key = await crypto.subtle.importKey('raw', enc.encode(v.serverSeed), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hmac = hex(await crypto.subtle.sign('HMAC', key, enc.encode(String(v.drawId))));
  const sorted = [...v.soldTickets].sort((a, b) => a - b);
  const index = sorted.length ? Number(BigInt('0x' + hmac) % BigInt(sorted.length)) : -1;
  const computedWinner = index >= 0 ? sorted[index] : null;
  return {
    hash, hmac, index, count: sorted.length, computedWinner,
    hashMatches: hash === v.serverSeedHash,
    // only RANDOM draws (and the random fallback) are derived from the seed
    seedDerived: v.winMethod === 'random' || v.winMethod === 'fallback_random',
    winnerMatches: computedWinner === v.winningTicketNo,
  };
}
