import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Coins, Empty, field, Load } from '../components/ui';
import { api } from '../lib/api';
import { fmtDateTime, ticketLabel } from '../lib/time';
import type { WinnerRow } from '../lib/types';

const METHOD: Record<string, string> = { random: 'Random draw', admin_selected: 'Admin-selected', fallback_random: 'Random (fallback)' };

export function Winners() {
  const [search, setSearch] = useState('');
  const q = useQuery({ queryKey: ['admin-winners'], queryFn: () => api<{ winners: WinnerRow[] }>('/admin/winners'), refetchInterval: 10_000 });
  return (
    <div className="space-y-3">
      <Load q={q}>{(d) => {
        const s = search.trim().toLowerCase();
        const rows = d.winners.filter((w) => !s || w.name.toLowerCase().includes(s) || w.mobile.includes(s));
        return (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Card><div className="text-xs text-muted">Winning draws</div><div className="text-xl font-extrabold text-brand-dark sm:text-2xl">{d.winners.length}</div></Card>
              <Card><div className="text-xs text-muted">Different winners</div><div className="text-xl font-extrabold text-brand-dark sm:text-2xl">{new Set(d.winners.map((w) => w.userId)).size}</div></Card>
              <Card className="col-span-2 sm:col-span-1"><div className="text-xs text-muted">Coins paid out</div><div className="text-xl font-extrabold text-brand-dark sm:text-2xl"><Coins n={d.winners.reduce((a, w) => a + (w.prizeAmount ?? 0), 0)} size={20} /></div></Card>
            </div>
            <input className={`${field} md:!w-72`} placeholder="Search name or mobile" value={search} onChange={(e) => setSearch(e.target.value)} />
            {rows.length === 0 ? <Empty>{d.winners.length ? 'No winner matches your search.' : 'No draw has been won yet.'}</Empty> : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {rows.map((w) => (
                  <Card key={w.drawId}>
                    <div className="flex items-center justify-between gap-2">
                      <b className="truncate">{w.name}</b>
                      <Coins n={w.prizeAmount ?? 0} />
                    </div>
                    <div className="text-xs text-muted">+{w.mobile} · user id {w.userId}</div>
                    <div className="mt-2 text-xs">
                      <b>{w.packageName}</b> · draw #{w.drawId} · ticket <b className="tabular-nums">#{ticketLabel(w.ticketNo ?? 0)}</b>
                    </div>
                    <div className="text-[11px] text-muted">{fmtDateTime(w.drawTime)} · {METHOD[w.winMethod ?? ''] ?? w.winMethod}</div>
                  </Card>
                ))}
              </div>
            )}
            <p className="text-center text-[11px] text-muted">Showing the 500 latest wins.</p>
          </>
        );
      }}</Load>
    </div>
  );
}
