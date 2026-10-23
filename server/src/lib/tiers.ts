/** Leading-digit match prizes. 6 digits = the main prize; 1..5 matching leading digits = consolation tiers. */
export const TIER_DIGITS = [1, 2, 3, 4, 5] as const;

/** How many digits, counted from the left, two ticket numbers share in an unbroken run. */
export function prefixMatch(winningNo: number, ticketNo: number) {
  const a = String(winningNo);
  const b = String(ticketNo);
  let k = 0;
  while (k < a.length && k < b.length && a[k] === b[k]) k++;
  return k;
}

/** Starting prizes for a new package (admin edits them afterwards): multiples of the ticket price. */
export const defaultTierPrizes = (price: number): Record<number, number> => ({
  1: Math.max(1, Math.round(price * 0.1)),
  2: Math.max(1, Math.round(price * 0.5)),
  3: Math.max(1, Math.round(price * 2)),
  4: Math.max(1, Math.round(price * 10)),
  5: Math.max(1, Math.round(price * 40)),
});
