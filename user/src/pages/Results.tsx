import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Item } from '../components/motion';
import { Card, Coins, Empty, ErrorBox, ModeBadge, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { fmtDateTime, ticketLabel } from '../lib/time';
import type { Draw, Pkg, ResultRow } from '../lib/types';
import { headerGradient } from '../theme';

const TICKET_IMG = '/result-ticket.png';

// Chips ka sequence (Name admin mein bilkul aise hi hona chahiye)
const ORDER = ['1 करोड़', '2 करोड़', '5 लाख', '10 लाख', '20 लाख'];
const rank = (name: string) => {
  const i = ORDER.indexOf(name.trim());
  return i === -1 ? 99 : i;
};

const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#ec4899'];
const PRIZE_LABELS = ['1st Prize', '2nd Prize', '3rd Prize', '4th Prize', '5th Prize'];

// Card ke hisaab se 1st prize (sirf display ke liye). Order: 1 करोड़, 2 करोड़, 5 लाख, 10 लाख, 20 लाख
const AMOUNTS = [10000000, 20000000, 500000, 1000000, 2000000];

// Sirf display ke liye: baaki prizes % se nikalte hain (backend inko pay nahi karta)
const TOP5_PCT = [1, 0.2, 0.1, 0.05, 0.02];
const DIGIT_ROWS = [
  { label: 'Full Match', sub: '6 Digit', pct: 1, bg: 'bg-green-100' },
  { label: '4 Digit Match', sub: 'Any 4 digit', pct: 0.01, bg: 'bg-blue-100' },
  { label: '3 Digit Match', sub: 'Any 3 digit', pct: 0.001, bg: 'bg-purple-100' },
  { label: '2 Digit Match', sub: 'Any 2 digit', pct: 0.0001, bg: 'bg-orange-100' },
  { label: '1 Digit Match', sub: 'Last digit', pct: 0.00001, bg: 'bg-pink-100' },
];

const shiftDate = (date: string, days: number) => {
  const d = date ? new Date(`${date}T00:00:00Z`) : new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export function Results() {
  const [sp, setSp] = useSearchParams();
  const packageId = sp.get('packageId') ?? '';
  const date = sp.get('date') ?? '';
  const drawParam = sp.get('draw') ?? '';
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };

  const pkgs = useQuery({ queryKey: ['packages'], queryFn: () => api<{ packages: Pkg[] }>('/packages') });
  const q = useQuery({
    queryKey: ['results', packageId, date],
    queryFn: () => api<{ results: ResultRow[] }>(`/results?${new URLSearchParams({ ...(packageId && { packageId }), ...(date && { date }) })}`),
    refetchInterval: 10_000,
  });

  const sortedPkgs = pkgs.data ? [...pkgs.data.packages].sort((a, b) => rank(a.name) - rank(b.name)) : [];
  const idxOf = (id: number) => Math.max(0, sortedPkgs.findIndex((p) => p.id === id));
  const colorOf = (id: number) => COLORS[idxOf(id) % COLORS.length];
  const labelOf = (id: number) => PRIZE_LABELS[idxOf(id)] ?? 'Prize';

  if (drawParam) {
    return (
      <ResultDetail
        id={drawParam}
        colorOf={colorOf}
        onBack={() => set('draw', '')}
      />
    );
  }

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
        <Item className="no-scrollbar flex gap-2 overflow-x-auto py-1">
          <Pill active={!packageId} onClick={() => set('packageId', '')}>All</Pill>
          {sortedPkgs.map((p) => (
            <Pill key={p.id} active={packageId === String(p.id)} onClick={() => set('packageId', String(p.id))}>{p.name}</Pill>
          ))}
        </Item>

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
              <button key={r.drawId} type="button" onClick={() => set('draw', String(r.drawId))} className="block w-full text-left">
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
                        <div className="text-xl font-extrabold tabular-nums" style={{ color: c }}>{ticketLabel(r.winningTicketNo!)}</div>
                        <div className="text-[11px] text-muted">{r.winnerName} · <Coins n={r.prizeAmount ?? 0} size={11} /></div>
                      </>
                    ) : <span className="text-xs font-semibold text-muted">Cancelled</span>}
                  </div>
                </Card>
              </button>
            );
          })}</div>}
      </div>
    </div>
  );
}

function ResultDetail({ id, colorOf, onBack }: { id: string; colorOf: (pkgId: number) => string; onBack: () => void }) {
  const q = useQuery({ queryKey: ['draw', id], queryFn: () => api<Draw>(`/draws/${id}`) });
  const d = q.data;

  const header = (
    <div className="relative flex items-center justify-center px-4 py-3 text-white" style={headerGradient}>
      <button type="button" onClick={onBack} aria-label="Back" className="absolute left-3 p-2 text-2xl leading-none">‹</button>
      <h1 className="text-lg font-bold">Result Details</h1>
      {d && (
        <span className="absolute right-3 rounded-pill bg-white/15 px-2 py-1 text-[11px] font-semibold">
          {new Date(d.drawTime).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')}
        </span>
      )}
    </div>
  );

  if (q.isLoading) return <div>{header}<Spinner /></div>;
  if (q.error || !d) return <div>{header}<ErrorBox error={q.error} retry={() => q.refetch()} /></div>;

  const c = colorOf(d.packageId);
  const idx = ORDER.indexOf(d.packageName.trim());
  const first = idx >= 0 ? AMOUNTS[idx] : (d.prizeAmount ?? 0);

  return (
    <div className="pb-6">
      {header}
      <div className="mx-auto max-w-md space-y-3 p-3 md:max-w-xl">
        {/* Ticket image */}
        <img src={TICKET_IMG} alt="Lottery ticket" className="block h-auto w-full rounded-xl object-contain shadow-card" />

        {/* Card + total prize */}
        <div className="flex items-center justify-between rounded-card bg-white p-3 shadow-card">
          <div>
            <div className="text-xs text-muted">{d.packageName} Draw</div>
            <div className="text-2xl font-extrabold" style={{ color: c }}><Coins n={first} size={22} /></div>
          </div>
          <span className="rounded-pill px-3 py-1 text-xs font-bold text-white" style={{ background: c }}>1st Prize</span>
        </div>

        {/* Top 5 */}
        <div className="rounded-card bg-white p-3 shadow-card">
          <div className="mb-2 flex items-center gap-1 text-sm font-bold text-brand-dark">🏆 Top 5 Prize Details</div>
          <div className="grid grid-cols-5 gap-1 text-center">
            {PRIZE_LABELS.map((l, i) => (
              <div key={l} className="overflow-hidden rounded-lg border border-line">
                <div className="py-1 text-[9px] font-bold text-white" style={{ background: COLORS[i] }}>{l}</div>
                <div className="px-0.5 py-2 text-[11px] font-extrabold"><Coins n={Math.round(first * TOP5_PCT[i])} size={10} /></div>
              </div>
            ))}
          </div>
        </div>

        {/* Digit match */}
        <div className="overflow-hidden rounded-card bg-white shadow-card">
          <div className="px-3 pt-3 text-sm font-bold text-brand-dark">Digit Match Prize</div>
          <div className="mt-2 grid grid-cols-2 bg-blue-50 px-3 py-1.5 text-[10px] font-bold text-muted">
            <span>Match Type</span><span className="text-right">Winning Amount</span>
          </div>
          {DIGIT_ROWS.map((r) => (
            <div key={r.label} className={`grid grid-cols-2 items-center px-3 py-2 text-xs ${r.bg}`}>
              <div>
                <div className="font-bold">{r.label}</div>
                <div className="text-[10px] text-muted">({r.sub})</div>
              </div>
              <div className="text-right font-extrabold"><Coins n={Math.max(1, Math.round(first * r.pct))} size={11} /></div>
            </div>
          ))}
          <p className="px-3 py-2 text-[10px] text-muted">Prize distribution sirf dikhane ke liye hai. Asli payout sirf 1st prize ka hota hai.</p>
        </div>

        <Link to={`/results?packageId=${d.packageId}`} onClick={onBack}
          className="block rounded-btn bg-gradient-to-b from-red-500 to-red-700 py-3 text-center font-bold text-white shadow-card">
          View Full Results
        </Link>
      </div>
    </div>
  );
}