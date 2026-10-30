import { createHash, randomBytes } from 'crypto';

/** Per-draw seed; its hash drives the Pick grid's suggested numbers (ticketOffers). */
export const newSeed = () => randomBytes(32).toString('hex');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

