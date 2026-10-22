import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Coins, Card, Empty, ErrorBox, ModeBadge, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { fmtDateTime, ticketLabel } from '../lib/time';
import type { Draw, Pkg, ResultRow } from '../lib/types';
import { headerGradient } from '../theme';

const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#ec4899'];
const PRIZE_LABELS = ['1st Prize', '2nd Prize', '3rd Prize', '4th Prize', '5th Prize'];
const PRIZE_AMOUNTS = ['₹1 करोड़', '₹2 करोड़', '₹5 लाख', '₹10 लाख', '₹20 लाख'];
const PRIZE_TIERS = ['Grand', 'Mega', 'Special', 'Special', 'Super'];
const PRIZE_VALUES = [10_000_000, 20_000_000, 500_000, 1_000_000, 2_000_000];
const EXAMPLE_WINNING_NUMBER = 255133;
const DIGIT_ROWS = [
  { label: 'Full Match', sub: '5 Digit', digits: 5, pct: 0.01, bg: 'bg-green-100' },
  { label: '4 Digit Match', sub: 'Any 4 digit', digits: 4, pct: 0.001, bg: 'bg-blue-100' },
  { label: '3 Digit Match', sub: 'Any 3 digit', digits: 3, pct: 0.0001, bg: 'bg-purple-100' },
  { label: '2 Digit Match', sub: 'Any 2 digit', digits: 2, pct: 0.00001, bg: 'bg-orange-100' },
  { label: '1 Digit Match', sub: 'Last digit', digits: 1, pct: 0.000001, bg: 'bg-pink-100' },
];

export function Results() {
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const drawParam = sp.get('draw') ?? '';
  const packageId = sp.get('packageId') ?? '';
  const view = sp.get('view') ?? '';

  const pkgs = useQuery({ queryKey: ['packages'], queryFn: () => api<{ packages: Pkg[] }>('/packages') });
  const results = useQuery({
    queryKey: ['results', 'latest', packageId],
    queryFn: () => api<{ results: ResultRow[] }>(`/results${packageId ? `?packageId=${encodeURIComponent(packageId)}` : ''}`),
    refetchInterval: 10_000,
  });

  const idxOf = (id: number) => Math.max(0, pkgs.data?.packages.findIndex((p) => p.id === id) ?? -1);
  const colorOf = (id: number) => COLORS[idxOf(id) % COLORS.length];
  const latestDrawId = results.data?.results[0]?.drawId;
  const selectedDrawId = drawParam || (!['soon', 'full'].includes(view) && latestDrawId ? String(latestDrawId) : '');
  if (!drawParam && results.isLoading) return <><PageHeader title="Results" back={false} /><Spinner /></>;
  if (!drawParam && results.error) return <><PageHeader title="Results" back={false} /><ErrorBox error={results.error} retry={() => results.refetch()} /></>;

  if (selectedDrawId) {
    return (
      <ResultDetail
        id={selectedDrawId}
        colorOf={colorOf}
        onBack={() => navigate(-1)}
      />
    );
  }

  if (view === 'full') {
    return (
      <div>
        <PageHeader title="Full Results" back={false} />
        <div className="space-y-3 p-4 md:mx-auto md:max-w-5xl md:px-6">
          {results.data?.results.length ? (
            <div className="md:grid md:grid-cols-2 md:gap-x-4">
              {results.data.results.map((result) => {
                const color = colorOf(result.packageId);
                return (
                  <Link
                    key={result.drawId}
                    to={`/results?view=full&draw=${result.drawId}`}
                    className="block text-left"
                  >
                    <Card className="mb-3 flex items-center gap-3 !p-3">
                      <div
                        className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl text-white"
                        style={{ background: color }}
                      >
                        <span className="text-lg leading-none">🏆</span>
                        <span className="mt-0.5 max-w-full truncate px-1 text-[10px] font-bold">{result.packageName}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold" style={{ color }}>{result.packageName} Result</div>
                        <div className="text-xs text-muted">{fmtDateTime(result.drawTime)} · Draw #{result.drawId}</div>
                        <ModeBadge mode={result.mode} className="mt-1 !bg-brand-light !text-brand-dark" />
                      </div>
                      <div className="text-right">
                        {result.status === 'completed' && result.winningTicketNo !== null ? (
                          <>
                            <div className="text-lg font-extrabold tabular-nums" style={{ color }}>
                              {ticketLabel(result.winningTicketNo)}
                            </div>
                            <div className="text-[10px] text-muted"><Coins n={result.prizeAmount ?? 0} size={10} /></div>
                          </>
                        ) : <span className="text-xs font-semibold text-muted">Cancelled</span>}
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          ) : <Empty>No results available yet.</Empty>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Results" back={false} />
      <div className="mx-auto flex min-h-[55vh] max-w-md flex-col justify-center gap-4 p-4 md:max-w-xl">
        <div className="relative overflow-hidden rounded-card border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-yellow-100 px-4 py-6 text-center shadow-[0_4px_18px_rgba(202,138,4,0.18)]">
          <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-yellow-300/40 blur-2xl" />
          <div aria-hidden className="relative mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-orange-400 text-xl shadow-md">
            ✨
          </div>
          <p className="relative text-base font-extrabold leading-snug text-amber-900">
            Results will be available soon.
          </p>
        </div>
        <Link to="/results?view=full"
          className="block rounded-btn bg-gradient-to-b from-red-500 to-red-700 py-3 text-center font-bold text-white shadow-card">
          View Full Results
        </Link>
      </div>
    </div>
  );
}

function ResultDetail({
  id,
  colorOf,
  onBack,
}: {
  id: string;
  colorOf: (pkgId: number) => string;
  onBack: () => void;
}) {
  const [selectedPrize, setSelectedPrize] = useState(0);
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
  const selectedPrizeAmount = PRIZE_VALUES[selectedPrize];

  return (
    <div className="pb-6">
      {header}
      <div className="mx-auto max-w-md space-y-2 p-2 md:max-w-xl md:space-y-3 md:p-3">
        <div className="relative overflow-hidden rounded-card border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-yellow-100 px-4 py-5 text-center shadow-[0_4px_18px_rgba(202,138,4,0.18)]">
          <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-yellow-300/40 blur-2xl" />
          <div aria-hidden className="relative mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-orange-400 text-xl shadow-md">
            ✨
          </div>
          <p className="relative text-base font-extrabold leading-snug text-amber-900">
            Results will be available soon.
          </p>
        </div>

        {/* Winning number */}
        <div className="flex items-center gap-2 rounded-card bg-white p-3 shadow-card">
          <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">✓</span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-muted">Winning Number</div>
            <div className="text-2xl font-extrabold tabular-nums" style={{ color: c }}>
              {d.winningTicketNo === null ? 'Cancelled' : ticketLabel(d.winningTicketNo)}
            </div>
          </div>
          {d.winningTicketNo !== null && (
            <span className="shrink-0 rounded-pill px-3 py-1 text-xs font-bold text-white" style={{ background: c }}>🏆 1st Prize</span>
          )}
        </div>

        {/* Top 5 */}
        <div className="rounded-card border border-blue-100 bg-gradient-to-br from-white via-blue-50 to-indigo-50 p-3 shadow-[0_8px_24px_rgba(30,86,200,0.14)]">
          <div className="mb-3 flex items-center gap-1 text-sm font-extrabold text-brand-dark">🏆 Top 5 Prize Details</div>
          <div className="grid grid-cols-5 gap-1 text-center sm:gap-1.5">
            {PRIZE_LABELS.map((l, i) => (
              <button
                key={l}
                type="button"
                onClick={() => setSelectedPrize(i)}
                aria-pressed={selectedPrize === i}
                className={`flex h-20 min-w-0 w-full flex-col overflow-hidden rounded-lg border text-center shadow-sm transition duration-200 active:scale-95 ${
                  selectedPrize === i ? 'border-brand ring-2 ring-brand/30 shadow-md' : 'border-white/80 hover:-translate-y-0.5 hover:shadow-md'
                }`}
              >
                <div className="flex min-h-9 flex-1 items-center justify-center px-0.5 text-[10px] font-extrabold leading-tight text-white sm:text-xs" style={{ background: `linear-gradient(145deg, ${COLORS[i]}, ${COLORS[i]}bb)` }}>
                  {PRIZE_AMOUNTS[i]}
                </div>
                <div className="flex flex-1 flex-col items-center justify-center gap-0.5 bg-white/80 px-0.5 text-[9px] font-extrabold leading-tight sm:text-[10px]">
                  <span>{l}</span>
                  <span className="font-medium text-muted">({PRIZE_TIERS[i]})</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Digit match */}
        <div className="overflow-hidden rounded-card border border-blue-100 bg-white shadow-[0_8px_24px_rgba(30,86,200,0.14)]">
          <div className="bg-gradient-to-r from-blue-700 to-indigo-600 px-3 py-2 text-sm font-extrabold text-white">Digit Match Prize</div>
          <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-2 bg-blue-50 px-3 py-1.5 text-[10px] font-bold text-muted">
            <span>Match Type</span><span className="text-right">Winning Amount</span><span className="text-right">Number</span>
          </div>
          {DIGIT_ROWS.map((r) => (
            <div key={r.label} className={`grid grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-2 text-xs ${r.bg}`}>
              <div>
                <div className="font-bold">{r.label}</div>
                <div className="text-[10px] text-muted">({r.sub})</div>
              </div>
              <div className="text-right font-extrabold"><Coins n={Math.max(1, Math.round(selectedPrizeAmount * r.pct))} size={11} /></div>
              <div className="min-w-10 text-right font-extrabold tabular-nums">
                {ticketLabel(d.winningTicketNo ?? EXAMPLE_WINNING_NUMBER).slice(-r.digits)}
              </div>
            </div>
          ))}
        </div>

        <Link to="/results?view=full"
          className="block rounded-btn bg-gradient-to-b from-red-500 to-red-700 py-3 text-center font-bold text-white shadow-card">
          View Full Results
        </Link>
      </div>
    </div>
  );
}