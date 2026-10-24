import { fmtNum, ticketLabel } from './time';
import type { AuditRow } from './types';

export const ACTION_LABEL: Record<string, string> = {
  package_create: 'Package created',
  package_update: 'Package edited',
  package_delete: 'Package deleted',
  tier_prizes_update: 'Digit prizes changed',
  set_mode: 'Draw mode changed',
  select_winner: 'Winner selected',
  adjust_coins: 'Coins adjusted',
  draw_fallback_random: 'Random fallback (system)',
};

const FIELD: Record<string, string> = {
  name: 'Name', price: 'Ticket price', prizeType: 'Prize type', prizeValue: 'Prize', maxTickets: 'Max tickets',
  drawIntervalMinutes: 'Repeat every (min)', dailyTime: 'Daily time (IST)', theme: 'Theme', isActive: 'Active',
};
const MODE: Record<string, string> = { random: 'Random', admin_selected: 'Admin selects' };

const show = (k: string, v: unknown): string => {
  if (v === null || v === undefined || v === '') return '–';
  if (k === 'isActive') return v ? 'Yes' : 'No';
  if (k === 'prizeType') return v === 'fixed' ? 'Fixed coins' : '% of pool';
  if (k === 'dailyTime') return String(v).slice(0, 5);
  return typeof v === 'number' ? fmtNum(v) : String(v);
};
// numbers can come back as strings from jsonb snapshots: compare by display value
const same = (k: string, a: unknown, b: unknown) => show(k, a) === show(k, b);

/** Human-readable "what changed" lines for one audit row. */
export function describe(a: AuditRow): string[] {
  const p = (a.payload ?? {}) as Record<string, any>;
  switch (a.action) {
    case 'package_create':
      return Object.keys(FIELD).filter((k) => p[k] !== undefined && p[k] !== null).map((k) => `${FIELD[k]}: ${show(k, p[k])}`);
    case 'package_delete':
      return [`Deleted "${p.name}" (ticket price ${show('price', p.price)}, prize ${show('prizeValue', p.prizeValue)})`,
        ...(a.drawId ? [`Empty running draw #${a.drawId} cancelled`] : [])];
    case 'package_update': {
      const before = p.before ?? {}, patch = p.patch ?? {};
      const lines = Object.keys(FIELD).filter((k) => patch[k] !== undefined && !same(k, before[k], patch[k]))
        .map((k) => `${FIELD[k]}: ${show(k, before[k])} → ${show(k, patch[k])}`);
      return lines.length ? lines : ['Saved with no changes'];
    }
    case 'tier_prizes_update': {
      const was = new Map<number, unknown>((p.before ?? []).map((r: any) => [Number(r.matchDigits), r.prize]));
      const lines = (p.after ?? []).filter((r: any) => !same('prize', was.get(Number(r.matchDigits)) ?? 0, r.prize))
        .map((r: any) => `${r.matchDigits} digit${r.matchDigits > 1 ? 's' : ''}: ${show('prize', was.get(Number(r.matchDigits)) ?? 0)} → ${show('prize', r.prize)}`);
      return lines.length ? lines : ['Saved with no changes'];
    }
    case 'set_mode':
      return [`Mode: ${MODE[p.from] ?? p.from} → ${MODE[p.to] ?? p.to}`];
    case 'select_winner':
      return [`Winning ticket: ${p.previous ? `#${ticketLabel(p.previous)}` : '–'} → #${ticketLabel(p.ticketNo)}`];
    case 'adjust_coins':
      return [`Amount: ${p.amount > 0 ? '+' : ''}${fmtNum(p.amount)} coins`, `New balance: ${fmtNum(p.balance)}`, ...(p.reason ? [`Reason: ${p.reason}`] : [])];
    case 'draw_fallback_random':
      return [`Selected ticket ${p.selectedTicketNo ? `#${ticketLabel(p.selectedTicketNo)}` : '–'}: ${p.reason ?? ''}`];
    default:
      return [JSON.stringify(p)];
  }
}

/** "Package X · draw #12 · user Y" */
export const target = (a: AuditRow) => [
  a.packageName && `Package ${a.packageName}`,
  a.drawId && `Draw #${a.drawId}`,
  a.targetUserName && `User ${a.targetUserName} (${a.targetUsername})`,
].filter(Boolean).join(' · ');

export const who = (a: AuditRow) => (a.adminId === null ? 'System' : a.adminName ? `${a.adminName} (${a.adminUsername})` : `Admin #${a.adminId}`);
