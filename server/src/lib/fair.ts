import { createHash, createHmac, randomBytes } from 'crypto';

/** Provably-fair helpers. Key = server_seed (hex string, used as utf8), message = String(draw_id). */
export const newSeed = () => randomBytes(32).toString('hex');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function pickWinner(serverSeed: string, drawId: number, soldTicketNos: number[]) {
  if (soldTicketNos.length === 0) throw new Error('no tickets sold');
  const sorted = [...soldTicketNos].sort((a, b) => a - b);
  const hmac = createHmac('sha256', serverSeed).update(String(drawId)).digest('hex');
  const index = Number(BigInt('0x' + hmac) % BigInt(sorted.length));
  return { hmac, index, ticketNo: sorted[index], sorted };
}
