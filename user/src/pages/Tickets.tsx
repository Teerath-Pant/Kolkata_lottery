import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Item } from '../components/motion';
import { Card, Coins, Empty, ErrorBox, ModeBadge, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { fmtDateTime, ticketLabel } from '../lib/time';
import type { MyTicket } from '../lib/types';
import { theme } from '../theme';

export function Tickets() {
  const [sp] = useSearchParams();
  const [tab, setTab] = useState<'all' | 'results'>(sp.get('tab') === 'results' ? 'results' : 'all');
  const q = useQuery({ queryKey: ['tickets'], queryFn: () => api<{ tickets: MyTicket[] }>('/me/tickets'), refetchInterval: 8000 });
  const rows = (q.data?.tickets ?? []).filter((t) => tab === 'all' || t.status === 'completed' || t.status === 'cancelled');

  return (
    <div>
      <PageHeader title="My Tickets" back={false} />
      <div className="space-y-3 p-4 md:mx-auto md:max-w-5xl md:px-6">
        <Item className="flex rounded-pill bg-white p-1 shadow-card md:max-w-md">
          {([['all', 'My Tickets'], ['results', 'My Results']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`relative flex-1 rounded-pill py-2 text-sm font-semibold ${tab === k ? 'text-white' : 'text-muted'}`}>
              {tab === k && <motion.span layoutId="tickets-pill" className="absolute inset-0 rounded-pill bg-brand" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />}
              <span className="relative">{l}</span>
            </button>
          ))}
        </Item>
        {q.isLoading ? <Spinner /> : q.error ? <ErrorBox error={q.error} retry={() => q.refetch()} /> : rows.length === 0 ? (
          <Empty>{tab === 'all' ? 'No tickets yet. Pick a draw on Home and book your lucky number.' : 'No finished draws yet.'}</Empty>
        ) : <div className="md:grid md:grid-cols-2 md:gap-x-4">{rows.map((t) => {
          const done = t.status === 'completed';
          const cancelled = t.status === 'cancelled';
          return (
            <Link key={t.ticketId} to={`/draw/${t.drawId}`}>
              <Card className="mb-3 flex items-center gap-3 !p-3">
                <div className="flex min-h-14 w-[5.25rem] shrink-0 flex-col items-center justify-center rounded-xl px-1 text-white"
                  style={{ background: `linear-gradient(160deg, ${theme.packages[t.theme].from}, ${theme.packages[t.theme].to})` }}>
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-white/80">Ticket</span>
                  <span className="text-base font-extrabold leading-tight tabular-nums">{ticketLabel(t.ticketNo)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{t.packageName}</div>
                  <div className="text-xs text-muted">Draw {fmtDateTime(t.drawTime)} · <Coins n={t.price} size={12} /></div>
                  <ModeBadge mode={t.mode} className="mt-1 !bg-brand-light !text-brand-dark" />
                </div>
                <div className="text-right text-xs font-semibold">
                  {t.won ? <span className="text-good">🏆 Won<br /><Coins n={t.prizeAmount ?? 0} size={12} /></span>
                    : done ? <span className="text-muted">Not won<br />#{ticketLabel(t.winningTicketNo!)} won</span>
                    : cancelled ? <span className="text-muted">Cancelled<br />Refunded</span>
                    : <span className="text-brand">Pending</span>}
                </div>
              </Card>
            </Link>
          );
        })}</div>}
      </div>
    </div>
  );
}
