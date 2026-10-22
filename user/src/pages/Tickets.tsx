import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, Coins, Empty, ErrorBox, ModeBadge, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { fmtDateTime, ticketLabel } from '../lib/time';
import type { MyTicket } from '../lib/types';
import { theme } from '../theme';

export function Tickets() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') === 'results' ? 'results' : 'all';
  const q = useQuery({ queryKey: ['tickets'], queryFn: () => api<{ tickets: MyTicket[] }>('/me/tickets'), refetchInterval: 8000 });
  const rows = (q.data?.tickets ?? []).filter((t) => tab === 'all' || t.status === 'completed' || t.status === 'cancelled');
  const groups = Array.from(rows.reduce((map, ticket) => {
    const group = map.get(ticket.drawId) ?? [];
    group.push(ticket);
    map.set(ticket.drawId, group);
    return map;
  }, new Map<number, MyTicket[]>()).values());

  return (
    <div>
      <PageHeader title={tab === 'results' ? 'My Results' : 'My Tickets'} back={false} />
      <div className="space-y-3 p-4 md:mx-auto md:max-w-5xl md:px-6">
        {q.isLoading ? <Spinner /> : q.error ? <ErrorBox error={q.error} retry={() => q.refetch()} /> : rows.length === 0 ? (
          <Empty>{tab === 'all' ? 'No tickets yet. Pick a draw on Home and book your lucky number.' : 'No finished draws yet.'}</Empty>
        ) : <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">{groups.map((tickets) => {
          const draw = tickets[0];
          const done = draw.status === 'completed';
          const cancelled = draw.status === 'cancelled';
          const won = tickets.some((ticket) => ticket.won);
          return (
            <Link key={draw.drawId} to={`/draw/${draw.drawId}`} className="block">
              <Card className="!overflow-hidden !p-0">
                <div
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-white"
                  style={{ background: `linear-gradient(110deg, ${theme.packages[draw.theme].from}, ${theme.packages[draw.theme].to})` }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-base font-extrabold">{draw.packageName}</div>
                    <div className="mt-0.5 text-[11px] text-white/85">Draw {fmtDateTime(draw.drawTime)}</div>
                  </div>
                  <div className="shrink-0 rounded-lg bg-white/15 px-2 py-1 text-right text-[11px] font-semibold">
                    <div>{tickets.length} {tickets.length === 1 ? 'Ticket' : 'Tickets'}</div>
                    <Coins n={draw.price} size={11} />
                  </div>
                </div>
                <div className="space-y-2.5 p-3">
                  <ModeBadge mode={draw.mode} className="!bg-brand-light !text-brand-dark" />
                  <div className="rounded-xl border border-line bg-slate-50 p-2.5">
                    <div className="mb-1.5 text-[11px] font-semibold text-muted">Your ticket numbers</div>
                    <div className="flex flex-wrap gap-1.5">
                    {tickets.map((ticket) => (
                      <span
                        key={ticket.ticketId}
                        className={`min-w-[4.5rem] rounded-lg border px-2 py-1.5 text-center text-xs font-extrabold tabular-nums shadow-sm ${
                          ticket.won ? 'bg-green-100 text-green-800' : cancelled ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-900'
                        }`}
                      >
                        {ticket.won ? '🏆 ' : ''}{ticketLabel(ticket.ticketNo)}
                      </span>
                    ))}
                    </div>
                  </div>
                  <div className={`text-xs font-semibold ${won ? 'text-good' : cancelled ? 'text-muted' : done ? 'text-muted' : 'text-brand'}`}>
                    {won
                      ? `Won · ${tickets.find((ticket) => ticket.won)?.prizeAmount?.toLocaleString('en-IN') ?? 0} coins`
                      : done
                        ? `Not won${draw.winningTicketNo !== null ? ` · Winning #${ticketLabel(draw.winningTicketNo)}` : ''}`
                        : cancelled ? 'Cancelled · Refunded' : 'Booked · Draw pending'}
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}</div>}
      </div>
    </div>
  );
}
