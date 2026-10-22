import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Item } from '../components/motion';
import { Card, Coins, Empty, ErrorBox, ModeBadge, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { fmtDateTime, ticketLabel } from '../lib/time';
import type { Pkg, ResultRow } from '../lib/types';

// Chips ka sequence (Name admin mein bilkul aise hi hona chahiye)
const ORDER = ['1 करोड़', '2 करोड़', '5 लाख', '10 लाख', '20 लाख'];
const rank = (name: string) => {
  const i = ORDER.indexOf(name.trim());
  return i === -1 ? 99 : i;
};

// Position ke hisaab se colours (Home ke tiles jaise)
const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#ec4899'];
const PRIZE_LABELS = ['1st Prize', '2nd Prize', '3rd Prize', '4th Prize', '5th Prize'];

const shiftDate = (date: string, days: number) => {
  const d = date ? new Date(`${date}T00:00:00Z`) : new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export function Results() {
  const [sp, setSp] = useSearchParams();
  const packageId = sp.get('packageId') ?? '';
  const date = sp.get('date') ?? '';
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };

  const pkgs = useQuery({ queryKey: ['packages'], queryFn: () => api<{ packages: Pkg[] }>('/packages') });
  const q = useQuery({
    queryKey: ['results', packageId, date],
    queryFn: () => api<{ results: ResultRow[] }>(`/results?${new URLSearchParams({ ...(packageId && { packageId }), ...(date && { date }) })}`),
    refetchInterval: 10_000,
  });

  const sortedPkgs = pkgs.data ? [...pkgs.data.packages].sort((a, b) => rank(a.name) - rank(b.name)) : [];
  const colorOf = (id: number) => {
    const i = sortedPkgs.findIndex((p) => p.id === id);
    return COLORS[(i === -1 ? 0 : i) % COLORS.length];
  };
  const labelOf = (id: number) => {
    const i = sortedPkgs.findIndex((p) => p.id === id);
    return PRIZE_LABELS[i] ?? 'Prize';
  };

  const chip = (active: boolean) => `relative shrink-0 rounded-pill px-4 py-1.5 text-xs font-semibold ${active ? 'text-white' : 'bg-white text-muted shadow-card'}`;
  const Pill = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <motion.button whileTap={{ scale: 0.92 }} className={chip(active)} onClick={onClick}>
      {active && <motion.span layoutId="results-chip" className="absolute inset-0 rounded-pill bg-bad" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />}
      <span className="relative">{children}</span>
    </motion.button>
  );

  return (
    <div>
      <PageHeader title="Results" back={false} />
      <div className="space-y-3 p-4 md:mx-auto md:max-w-5xl md:px-6">
        {/* Filter chips */}
        <Item className="no-scrollbar flex gap-2 overflow-x-auto py-1">
          <Pill active={!packageId} onClick={() => set('packageId', '')}>All</Pill>
          {sortedPkgs.map((p) => (
            <Pill key={p.id} active={packageId === String(p.id)} onClick={() => set('packageId', String(p.id))}>{p.name}</Pill>
          ))}
        </Item>

        {/* Date bar: prev - date - next */}
        <Item className="flex items-center gap-2">
          <button type="button" aria-label="Previous day" onClick={() => set('date', shiftDate(date, -1))}
            className="rounded-btn border border-line bg-white px-3 py-2 text-sm font-bold">‹</button>
          <input type="date" value={date} onChange={(e) => set('date', e.target.value)} aria-label="Filter by date (UTC)"
            className="min-w-0 flex-1 rounded-btn border border-line bg-white px-3 py-2 text-sm md:w-64 md:flex-none" />
          <button type="button" aria-label="Next day" onClick={() => set('date', shiftDate(date, 1))}
            className="rounded-btn border border-line bg-white px-3 py-2 text-sm font-bold">›</button>
          {date && <button onClick={() => set('date', '')} className="text-sm font-semibold text-brand">Clear</button>}
        </Item>

        {q.isLoading ? <Spinner /> : q.error ? <ErrorBox error={q.error} retry={() => q.refetch()} /> :
          q.data!.results.length === 0 ? <Empty>No results for this filter yet.</Empty> :
          <div className="md:grid md:grid-cols-2 md:gap-x-4">{q.data!.results.map((r) => {
            const c = colorOf(r.packageId);
            return (
              <Link key={r.drawId} to={`/draw/${r.drawId}`}>
                <Card className="mb-3 flex items-center gap-3 !p-3">
                  <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl text-white" style={{ background: c }}>
                    <span className="text-lg leading-none">🏆</span>
                    <span className="mt-0.5 max-w-full truncate px-1 text-[11px] font-bold">{r.packageName}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold" style={{ color: c }}>{labelOf(r.packageId)}</div>
                    <div className="text-xs text-muted">{fmtDateTime(r.drawTime)} · Draw #{r.drawId}</div>
                    <ModeBadge mode={r.mode} className="mt-1 !bg-brand-light !text-brand-dark" />
                  </div>
                  <div className="text-right">
                    {r.status === 'completed' ? (
                      <>
                        <div className="text-xl font-extrabold tabular-nums" style={{ color: c }}>#{ticketLabel(r.winningTicketNo!)}</div>
                        <div className="text-[11px] text-muted">{r.winnerName} · <Coins n={r.prizeAmount ?? 0} size={11} /></div>
                      </>
                    ) : <span className="text-xs font-semibold text-muted">Cancelled</span>}
                  </div>
                </Card>
              </Link>
            );
          })}</div>}
      </div>
    </div>
  );
}