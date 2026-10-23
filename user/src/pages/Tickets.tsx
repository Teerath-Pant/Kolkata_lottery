import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, Empty, ErrorBox, PageHeader, Spinner } from '../components/ui';
import { TicketCard } from '../components/TicketCard';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime, ticketLabel } from '../lib/time';
import type { MyTicket } from '../lib/types';
import { theme } from '../theme';

export function Tickets() {
  const [sp] = useSearchParams();
  const { user: me } = useAuth();
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
        ) : <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{groups.map((tickets) => {
          const draw = tickets[0];
          const done = draw.status === 'completed';
          const cancelled = draw.status === 'cancelled';
          const won = tickets.some((ticket) => ticket.won);
          const tier = tickets.find((ticket) => ticket.tierPrize);
          const g = theme.packages[draw.theme];
          return (
            <Link key={draw.drawId} to={`/draw/${draw.drawId}`} className="block">
              <Card className="overflow-hidden !p-0 transition-shadow hover:shadow-lg">
                <div className="flex items-center justify-between gap-3 px-4 py-3 text-white" style={{ background: `linear-gradient(160deg, ${g.from}, ${g.to})` }}>
                  <div className="min-w-0">
                    <div className="truncate text-base font-extrabold">{draw.packageName}</div>
                    <div className="text-[11px] text-white/80">{fmtDateTime(draw.drawTime)}</div>
                  </div>
                  <div className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-xs font-bold">{tickets.length} {tickets.length === 1 ? 'ticket' : 'tickets'}</div>
                </div>
                <div className="space-y-3 p-4">
                  <div className="space-y-2">
                    {tickets.map((ticket) => (
                      <TicketCard
                        key={ticket.ticketId}
                        ticketNo={ticket.ticketNo}
                        drawTime={ticket.drawTime}
                        userName={me?.name}
                        ticketPrice={ticket.price}
                        qrValue={`${location.origin}/verify/${ticket.drawId}?t=${ticketLabel(ticket.ticketNo)}`}
                      />
                    ))}
                  </div>
                  <div className={`border-t border-line pt-2.5 text-sm font-bold ${won || tier ? 'text-good' : cancelled || done ? 'text-muted' : 'text-brand'}`}>
                    {won
                      ? `🎉 Won · ${tickets.find((ticket) => ticket.won)?.prizeAmount?.toLocaleString('en-IN') ?? 0} coins`
                      : tier
                        ? `🎉 ${tier.matchDigits}-digit match · ${tier.tierPrize!.toLocaleString('en-IN')} coins`
                      : done
                        ? `Not won${draw.winningTicketNo !== null ? ` · Winning #${ticketLabel(draw.winningTicketNo)}` : ''}`
                        : cancelled ? 'Cancelled · Refunded' : `Booked · Draw pending · Open till ${fmtDateTime(draw.drawTime)}`}
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
