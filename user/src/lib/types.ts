import type { PackageTheme } from '../theme';

export type DrawMode = 'random' | 'admin_selected';
export type DrawStatus = 'open' | 'drawing' | 'completed' | 'cancelled';

export interface User { id: number; mobile: string; name: string; role: 'user' | 'admin' }

export interface Draw {
  id: number; packageId: number; packageName: string; theme: PackageTheme;
  status: DrawStatus; mode: DrawMode; drawTime: string;
  ticketPrice: number; prizeType: 'fixed' | 'pool_percent'; prizeValue: number; prizeAmount: number;
  maxTickets: number; minTickets: number; soldCount: number;
  serverSeedHash: string; serverSeed: string | null;
  winningTicketNo: number | null; winMethod: string | null; winnerName: string | null;
  myTicketNo: number | null; iWon: boolean; serverTime: string;
}

export interface Pkg {
  id: number; name: string; price: number; theme: PackageTheme;
  prizeType: 'fixed' | 'pool_percent'; prizeValue: number; maxTickets: number; minTickets: number;
  drawIntervalMinutes: number; isActive: boolean; currentDraw: Draw | null;
}

export interface LedgerRow { id: number; amount: number; type: string; refId: number | null; balanceAfter: number; createdAt: string }

export interface WalletInfo {
  balance: number; winnings: number; bonus: number; dailyClaimAmount: number;
  canClaim: boolean; nextClaimAt: string | null; recent: LedgerRow[];
}

export interface MyTicket {
  ticketId: number; drawId: number; ticketNo: number; createdAt: string; packageName: string; theme: PackageTheme;
  price: number; status: DrawStatus; mode: DrawMode; drawTime: string;
  winningTicketNo: number | null; prizeAmount: number | null; won: boolean | null;
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
