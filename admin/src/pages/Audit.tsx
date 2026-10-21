import { useQuery } from '@tanstack/react-query';
import { Card, Empty, Load } from '../components/ui';
import { api } from '../lib/api';
import { fmtDateTime } from '../lib/time';
import type { AuditRow } from '../lib/types';

export function Audit() {
  const q = useQuery({ queryKey: ['admin-audit'], queryFn: () => api<{ log: AuditRow[] }>('/admin/audit-log'), refetchInterval: 10_000 });
  return (
    <Load q={q}>{(d) => d.log.length === 0 ? <Empty>No admin actions yet.</Empty> : (
      <div className="grid gap-3 md:grid-cols-2">
        {d.log.map((a) => (
          <Card key={a.id} className="!p-3">
            <div className="flex justify-between text-sm"><b>{a.action}</b><span className="text-[11px] text-muted">{fmtDateTime(a.createdAt)}</span></div>
            <div className="text-[11px] text-muted">{a.adminId ? `admin ${a.adminId}` : 'system'}{a.drawId ? ` · draw #${a.drawId}` : ''}{a.ip ? ` · ${a.ip}` : ''}</div>
            <pre className="mt-1 overflow-x-auto rounded bg-page p-2 text-[10px]">{JSON.stringify(a.payload, null, 1)}</pre>
          </Card>
        ))}
      </div>
    )}</Load>
  );
}
