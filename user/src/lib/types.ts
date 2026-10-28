import type { PackageTheme } from '../theme';

export type DrawMode = 'random' | 'admin_selected';
export type DrawStatus = 'open' | 'drawing' | 'completed' | 'cancelled';

export interface User { id: number; username: string; name: string; role: 'user' | 'admin'; verified: boolean }

export interface Draw {
  id: number; packageId: number; packageName: string; theme: PackageTheme;
  status: DrawStatus; mode: DrawMode; drawTime: string;
  ticketPrice: number; prizeType: 'fixed' | 'pool_percent'; prizeValue: number; prizeAmount: number;
  maxTickets: number; soldCount: number;
  serverSeedHash: string; serverSeed: string | null;
  winningTicketNo: number | null; winMethod: string | null; winnerName: string | null; completedAt: string | null;
  myTicketNos: number[]; iWon: boolean; serverTime: string;
  /** consolation prizes for 5..1 matching leading digits; winners is null until the draw completes */
  tiers: TierPrize[]; myTier: { matchDigits: number; prize: number } | null;
}

export interface TierPrize { matchDigits: number; prize: number; winners: number | null }

export interface Pkg {
  id: number; name: string; price: number; theme: PackageTheme;
  prizeType: 'fixed' | 'pool_percent'; prizeValue: number; maxTickets: number;
  drawIntervalMinutes: number | null; dailyTime: string | null; isActive: boolean; currentDraw: Draw | null;
}

export interface LedgerRow { id: number; amount: number; type: string; refId: number | null; balanceAfter: number; createdAt: string }

export interface WalletInfo {
  balance: number; winnings: number; bonus: number; recent: LedgerRow[];
}

export interface MyTicket {
  ticketId: number; drawId: number; ticketNo: number; createdAt: string; packageName: string; theme: PackageTheme;
  price: number; status: DrawStatus; mode: DrawMode; drawTime: string;
  winningTicketNo: number | null; prizeAmount: number | null; won: boolean | null;
  matchDigits: number | null; tierPrize: number | null;
}

export interface ResultRow {
  drawId: number; packageId: number; packageName: string; theme: PackageTheme; drawTime: string;
  status: DrawStatus; mode: DrawMode; winMethod: string | null; winningTicketNo: number | null;
  prizeAmount: number | null; winnerName: string | null;
}

export interface VerifyData {
  drawId: number; status: DrawStatus; mode: DrawMode; winMethod: string | null;
  serverSeedHash: string; serverSeed: string; soldTickets: number[]; winningTicketNo: number | null; formula: string;
}
