import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Coins, Card, Countdown, Empty, ErrorBox, PageHeader, Spinner } from '../components/ui';
import { TicketCard } from '../components/TicketCard';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime, ticketLabel } from '../lib/time';
import type { Draw, Pkg, ResultRow } from '../lib/types';
import { headerGradient, themeGradient } from '../theme';

const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#ec4899'];
const TIER_BG: Record<number, string> = {
  6: 'bg-green-100', 5: 'bg-blue-100', 4: 'bg-purple-100', 3: 'bg-orange-100', 2: 'bg-pink-100', 1: 'bg-yellow-100',
};

export function Results() {
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const drawParam = sp.get('draw') ?? '';
  const packageId = sp.get('packageId') ?? '';
  const view = sp.get('view') ?? '';

  const pkgs = useQuery({ queryKey: ['packages'], queryFn: () => api<{ packages: Pkg[] }>('/packages'), refetchInterval: 30_000 });
  const running = (pkgs.data?.packages ?? []).filter(
    (p) => p.isActive && (p.currentDraw?.status === 'open' || p.currentDraw?.status === 'drawing'),
  );
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
        running={running}
        onSelect={(drawId) => setSp((prev) => { prev.set('draw', String(drawId)); return prev; }, { replace: true })}
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
                        <div className="text-xs text-muted">{fmtDateTime(result.drawTime)} · Draw {result.drawId}</div>
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
  running,
  onSelect,
  onBack,
}: {
  id: string;
  colorOf: (pkgId: number) => string;
  running: Pkg[];
  onSelect: (drawId: number) => void;
  onBack: () => void;
}) {
  const q = useQuery({
    queryKey: ['draw', id],
    queryFn: () => api<Draw>(`/draws/${id}`),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => (['completed', 'cancelled'].includes(query.state.data?.status ?? '') ? false : 5_000),
  });
  const d = q.data;

  // Top ticket = the last drawn ticket of this package. It stays until the package's next draw completes.
  const viewedDrawn = d?.status === 'completed' && d.winningTicketNo !== null;
  const lastDrawnRow = useQuery({
    queryKey: ['results', 'last-drawn', d?.packageId],
    queryFn: () => api<{ results: ResultRow[] }>(`/results?packageId=${d!.packageId}&limit=20`),
    enabled: !!d && !viewedDrawn,
    refetchInterval: 10_000,
    select: (r) => r.results.find((x) => x.status === 'completed' && x.winningTicketNo !== null),
  });
  const lastDrawnId = viewedDrawn ? undefined : lastDrawnRow.data?.drawId;
  const lastDrawn = useQuery({
    queryKey: ['draw', String(lastDrawnId)],
    queryFn: () => api<Draw>(`/draws/${lastDrawnId}`),
    enabled: lastDrawnId !== undefined,
    placeholderData: keepPreviousData,
  });
  const ticketDraw = viewedDrawn ? d : lastDrawnId !== undefined ? lastDrawn.data : undefined;
  // a cancelled draw has no result: show the package's last winning draw instead
  const r = d?.status === 'cancelled' && ticketDraw ? ticketDraw : d;

  const header = (
    <div className="relative flex items-center justify-center px-4 py-3 text-white" style={headerGradient}>
      <button type="button" onClick={onBack} aria-label="Back" className="absolute left-3 p-2 text-2xl leading-none">‹</button>
      <h1 className="text-lg font-bold">Result Details</h1>
      {r && (
        <span className="absolute right-3 rounded-pill bg-white/15 px-2 py-1 text-[11px] font-semibold">
          {new Date(r.drawTime).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')}
        </span>
      )}
    </div>
  );

  if (q.isLoading) return <div>{header}<Spinner /></div>;
  if (q.error || !d || !r) return <div>{header}<ErrorBox error={q.error} retry={() => q.refetch()} /></div>;

  const c = colorOf(d.packageId);

  return (
    <div className="pb-6">
      {header}
      <div className="mx-auto max-w-md space-y-2 p-2 md:max-w-xl md:space-y-3 md:p-3">
        {ticketDraw ? (
          <DrawTicket key={ticketDraw.id} d={ticketDraw} />
        ) : (
          <div className="relative overflow-hidden rounded-card border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-yellow-100 px-4 py-5 text-center shadow-[0_4px_18px_rgba(202,138,4,0.18)]">
            <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-yellow-300/40 blur-2xl" />
            <div aria-hidden className="relative mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-orange-400 text-xl shadow-md">
              ✨
            </div>
            <p className="relative text-base font-extrabold leading-snug text-amber-900">
              {lastDrawnRow.isLoading || lastDrawn.isLoading ? 'Loading last drawn ticket…' : 'Results will be available soon.'}
            </p>
          </div>
        )}

        {/* Winning number */}
        <div className="flex items-center gap-2 rounded-card bg-white p-3 shadow-card">
          <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">✓</span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-muted">Winning Number</div>
            <div className="text-2xl font-extrabold tabular-nums" style={{ color: c }}>
              {r.winningTicketNo !== null ? ticketLabel(r.winningTicketNo) : r.status === 'cancelled' ? 'No result yet' : 'Awaiting draw'}
            </div>
          </div>
          {r.winningTicketNo !== null && (
            <span className="shrink-0 rounded-pill px-3 py-1 text-xs font-bold text-white" style={{ background: c }}>🏆 1st Prize</span>
          )}
        </div>

        {/* Running draws */}
        <div className="rounded-card border border-blue-100 bg-gradient-to-br from-white via-blue-50 to-indigo-50 p-3 shadow-[0_8px_24px_rgba(30,86,200,0.14)]">
          <div className="mb-3 flex items-center gap-1 text-sm font-extrabold text-brand-dark">🏆 Running Lucky Draws</div>
          {running.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-1.5 text-center">
              {running.map((p) => {
                const rd = p.currentDraw!;
                const active = rd.id === d.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onSelect(rd.id)}
                    aria-pressed={active}
                    className={`flex h-20 min-w-0 w-full flex-col overflow-hidden rounded-lg border text-center shadow-sm transition duration-200 active:scale-95 ${
                      active ? 'border-brand ring-2 ring-brand/30 shadow-md' : 'border-white/80 hover:-translate-y-0.5 hover:shadow-md'
                    }`}
                  >
                    <div className="flex min-h-9 flex-1 items-center justify-center px-0.5 text-[11px] font-extrabold leading-tight text-white sm:text-xs" style={themeGradient(p.theme)}>
                      <Coins n={rd.prizeAmount} size={11} className="font-extrabold" />
                    </div>
                    <div className="flex flex-1 flex-col items-center justify-center gap-0.5 bg-white/80 px-0.5 text-[9px] font-extrabold leading-tight sm:text-[10px]">
                      <span className="max-w-full truncate">{p.name}</span>
                      <Countdown target={rd.drawTime} serverTime={rd.serverTime} className="font-medium text-muted" />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : <p className="text-center text-xs text-muted">No draws running right now.</p>}
        </div>

        {/* Digit match: digits are matched from the left of the winning number */}
        <div className="overflow-hidden rounded-card border border-blue-100 bg-white shadow-[0_8px_24px_rgba(30,86,200,0.14)]">
          <div className="bg-gradient-to-r from-blue-700 to-indigo-600 px-3 py-2 text-sm font-extrabold text-white">Digit Match Prize</div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-2 bg-blue-50 px-3 py-1.5 text-[10px] font-bold text-muted">
            <span>Match Type</span><span className="text-right">Winning Amount</span><span className="text-right">Number</span>
          </div>
          {[{ matchDigits: 6, prize: r.prizeAmount, winners: r.status === 'completed' && r.winningTicketNo !== null ? 1 : null }, ...r.tiers]
            .filter((t) => t.matchDigits === 6 || t.prize > 0)
            .map((t) => (
              <div key={t.matchDigits} className={`grid grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-2 text-xs ${TIER_BG[t.matchDigits]}`}>
                <div>
                  <div className="font-bold">{t.matchDigits === 6 ? 'Full Match (6 digits)' : `${t.matchDigits} Digit Match`}</div>
                  <div className="text-[10px] text-muted">
                    ({t.matchDigits === 6 ? 'Main prize' : `First ${t.matchDigits} digit${t.matchDigits > 1 ? 's' : ''}`}
                    {t.winners !== null ? ` · ${t.winners} winner${t.winners === 1 ? '' : 's'}` : ''})
                  </div>
                </div>
                <div className="text-right font-extrabold"><Coins n={t.prize} size={11} /></div>
                <div className="min-w-10 text-right font-extrabold tabular-nums">
                  {r.winningTicketNo !== null ? ticketLabel(r.winningTicketNo).slice(0, t.matchDigits) : '•'.repeat(t.matchDigits)}
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
function DrawTicket({ d }: { d: Draw }) {
  const { user: me } = useAuth();
  const ticketNo = d.winningTicketNo;
  if (ticketNo === null) return null;
  return (
    <TicketCard
      ticketNo={ticketNo}
      drawTime={d.drawTime}
      userName={d.iWon ? me?.name ?? d.winnerName ?? undefined : d.winnerName ?? undefined}
      ticketPrice={d.ticketPrice}
      qrValue={`${location.origin}/verify/${d.id}?t=${ticketLabel(ticketNo)}`}
    />
  );
}