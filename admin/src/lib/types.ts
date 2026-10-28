import type { PackageTheme } from '../theme';

export type DrawMode = 'random' | 'admin_selected';
export type DrawStatus = 'open' | 'drawing' | 'completed' | 'cancelled';

export interface AdminUserInfo { id: number; username: string; name: string; role: 'user' | 'admin' }

export interface AdminDraw {
  id: number; packageId: number; packageName: string; status: DrawStatus; mode: DrawMode; drawTime: string;
  selectedTicketNo: number | null; winningTicketNo: number | null; winMethod: string | null; maxTickets: number; sold: number;
}

export interface AdminPkg {
  id: number; name: string; price: number; prizeType: 'fixed' | 'pool_percent'; prizeValue: number; maxTickets: number;
  drawIntervalMinutes: number | null; dailyTime: string | null; theme: PackageTheme; isActive: boolean;
  /** coins paid for 1..5 matching leading digits of the winning number (0 = tier off) */
  tierPrizes?: Record<number, number>;
  /** tickets sold in the running draw; > 0 locks the package until that draw's result is out */
  openDrawSold?: number;
}

export interface ManagedUser { id: number; username: string; name: string; role: string; balance: number | null; createdAt: string }

export interface WinnerRow {
  drawId: number; packageName: string; drawTime: string; ticketNo: number | null; prizeAmount: number | null; winMethod: string | null;
  userId: number; name: string; username: string;
}
export interface AuditRow {
  id: number; adminId: number | null; action: string; drawId: number | null; payload: unknown; ip: string | null; createdAt: string;
  adminName: string | null; adminUsername: string | null; packageId: number | null; packageName: string | null;
  targetUserName: string | null; targetUsername: string | null;
}
export interface AuditPage { log: AuditRow[]; total: number; page: number; pageSize: number; pages: number }

export interface ComplaintRow {
  id: number; userId: number; subject: string; message: string; status: 'open' | 'resolved'; createdAt: string; resolvedAt: string | null;
  name: string; username: string;
}
export interface ComplaintPage { complaints: ComplaintRow[]; total: number; open: number; page: number; pageSize: number; pages: number }
