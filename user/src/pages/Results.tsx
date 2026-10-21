import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Item } from '../components/motion';
import { Card, Coins, Empty, ErrorBox, ModeBadge, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { fmtDateTime, ticketLabel } from '../lib/time';
import type { Pkg, ResultRow } from '../lib/types';
import { theme } from '../theme';

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

  const chip = (active: boolean) => `relative shrink-0 rounded-pill px-3 py-1.5 text-xs font-semibold ${active ? 'text-white' : 'bg-white text-muted shadow-card'}`;
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
        <Item className="no-scrollbar flex gap-2 overflow-x-auto py-1">
          <Pill active={!packageId} onClick={() => set('packageId', '')}>All</Pill>
          {pkgs.data?.packages.map((p) => (
            <Pill key={p.id} active={packageId === String(p.id)} onClick={() => set('packageId', String(p.id))}>{p.name}</Pill>
          ))}
        </Item>
        <Item className="flex items-center gap-2">
          <input type="date" value={date} onChange={(e) => set('date', e.target.value)} aria-label="Filter by date (UTC)"
            className="flex-1 rounded-btn border border-line bg-white px-3 py-2 text-sm md:w-64 md:flex-none" />
          {date && <button onClick={() => set('date', '')} className="text-sm font-semibold text-brand">Clear</button>}
        </Item>

        {q.isLoading ? <Spinner /> : q.error ? <ErrorBox error={q.error} retry={() => q.refetch()} /> :
          q.data!.results.length === 0 ? <Empty>No results for this filter yet.</Empty> :
          <div className="md:grid md:grid-cols-2 md:gap-x-4">{q.data!.results.map((r) => {
            const t = theme.packages[r.theme];
            return (
              <Link key={r.drawId} to={`/draw/${r.drawId}`}>
                <Card className="mb-3 flex items-center gap-3 !p-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: `linear-gradient(160deg, ${t.from}, ${t.to})` }}>🏆</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{r.packageName}</div>
                    <div className="text-xs text-muted">{fmtDateTime(r.drawTime)} · Draw #{r.drawId}</div>
                    <ModeBadge mode={r.mode} className="mt-1 !bg-brand-light !text-brand-dark" />
                  </div>
                  <div className="text-right">
                    {r.status === 'completed' ? (
                      <>
                        <div className="text-lg font-extrabold tabular-nums" style={{ color: t.from }}>#{ticketLabel(r.winningTicketNo!)}</div>
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
