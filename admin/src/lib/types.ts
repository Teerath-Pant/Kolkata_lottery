export type DrawMode = 'random' | 'admin_selected';
export type DrawStatus = 'open' | 'drawing' | 'completed' | 'cancelled';

export interface AdminUserInfo { id: number; mobile: string; name: string; role: 'user' | 'admin' }

export interface AdminDraw {
  id: number; packageId: number; packageName: string; status: DrawStatus; mode: DrawMode; drawTime: string;
  selectedTicketNo: number | null; winningTicketNo: number | null; winMethod: string | null; maxTickets: number; sold: number;
}

export interface AdminPkg {
  id: number; name: string; price: number; prizeType: 'fixed' | 'pool_percent'; prizeValue: number; maxTickets: number;
  minTickets: number; drawIntervalMinutes: number; theme: 'green' | 'red' | 'blue'; isActive: boolean;
}

export interface ManagedUser { id: number; mobile: string; name: string; role: string; balance: number | null; createdAt: string }

export interface AuditRow { id: number; adminId: number | null; action: string; drawId: number | null; payload: unknown; ip: string | null; createdAt: string }
