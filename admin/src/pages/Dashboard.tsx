import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, Coins, Load, ModeBadge } from '../components/ui';
import { api } from '../lib/api';
import { fmtDateTime } from '../lib/time';
import type { AdminDraw, AdminPkg, AuditRow, ManagedUser } from '../lib/types';

const Stat = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <Card><div className="text-xs text-muted">{label}</div><div className="text-xl font-extrabold text-brand-dark sm:text-2xl">{children}</div></Card>
);

export function Dashboard() {
  const draws = useQuery({ queryKey: ['admin-draws', 'open'], queryFn: () => api<{ draws: AdminDraw[] }>('/admin/draws?status=open'), refetchInterval: 8000 });
  const users = useQuery({ queryKey: ['admin-users'], queryFn: () => api<{ users: ManagedUser[] }>('/admin/users') });
  const pkgs = useQuery({ queryKey: ['admin-packages'], queryFn: () => api<{ packages: AdminPkg[] }>('/admin/packages') });
  const audit = useQuery({ queryKey: ['admin-audit'], queryFn: () => api<{ log: AuditRow[] }>('/admin/audit-log') });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Open draws">{draws.data?.draws.length ?? '–'}</Stat>
        <Stat label="Active packages">{pkgs.data?.packages.filter((p) => p.isActive).length ?? '–'}</Stat>
        <Stat label="Users">{users.data ? users.data.users.filter((u) => u.role === 'user').length : '–'}</Stat>
        <Stat label="Coins in wallets">{users.data ? <Coins n={users.data.users.reduce((a, u) => a + (u.balance ?? 0), 0)} size={20} className="font-extrabold" /> : '–'}</Stat>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Open draws</h2><Link to="/draws" className="text-sm font-semibold text-brand">Manage</Link></div>
          <Load q={draws}>{(d) => d.draws.length === 0 ? <p className="text-sm text-muted">No open draws.</p> : (
            <div className="divide-y divide-line">
              {d.draws.map((x) => (
                <div key={x.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div><b>#{x.id} {x.packageName}</b><div className="text-xs text-muted">{fmtDateTime(x.drawTime)} · sold {x.sold}/{x.maxTickets}</div></div>
                  <ModeBadge mode={x.mode} />
                </div>
              ))}
            </div>
          )}</Load>
        </Card>
        <Card>
          <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Recent admin activity</h2></div>
          <Load q={audit}>{(d) => d.log.length === 0 ? <p className="text-sm text-muted">Nothing yet.</p> : (
            <div className="divide-y divide-line">
              {d.log.slice(0, 6).map((a) => (
                <div key={a.id} className="flex justify-between py-2 text-sm"><b>{a.action}</b><span className="text-xs text-muted">{fmtDateTime(a.createdAt)}</span></div>
              ))}
            </div>
          )}</Load>
        </Card>
      </div>
    </div>
  );
}
