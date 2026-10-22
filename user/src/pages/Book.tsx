import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Item, item as itemV } from '../components/motion';
import { useToast } from '../components/Toast';
import { Button, Coins, Countdown, ErrorBox, ModeBadge, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime, ticketLabel } from '../lib/time';
import type { Draw } from '../lib/types';
import { themeGradient } from '../theme';

export function Book() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { balance } = useAuth();
  const [pick, setPick] = useState<number | null>(null);
  const [random, setRandom] = useState(false);
  const idem = useRef<string | null>(null);

  const draw = useQuery({ queryKey: ['draw', id], queryFn: () => api<Draw>(`/draws/${id}`), refetchInterval: 5000 });
  const taken = useQuery({
    queryKey: ['taken', id],
    queryFn: () => api<{ maxTickets: number; taken: number[]; offers: number[] }>(`/draws/${id}/tickets`),
    refetchInterval: 4000,
  });
  const offers = taken.data?.offers ?? [];
  // a picked number someone else just bought drops out of the offers -> back to unselected
  const picked = pick !== null && offers.includes(pick) ? pick : null;

  const buy = useMutation({
    mutationFn: () => {
      idem.current ??= crypto.randomUUID();
      return api<{ ticketNo: number; balance: number }>(`/draws/${id}/buy`, {
        body: random ? { random: true } : { ticketNo: picked },
        headers: { 'Idempotency-Key': idem.current },
      });
    },
    onSuccess: (r) => {
      toast(`Ticket #${ticketLabel(r.ticketNo)} booked!`, 'success');
      ['me', 'wallet', 'tickets', 'draw', 'taken', 'packages'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      nav('/tickets', { replace: true });
    },
    onError: (e) => {
      idem.current = null; // a failed attempt may be retried as a fresh purchase
      toast(e instanceof Error ? e.message : 'Could not book', 'error');
      qc.invalidateQueries({ queryKey: ['taken', id] });
      setPick(null);
    },
  });

  if (draw.isLoading || taken.isLoading) return <><PageHeader title="Book Ticket" /><Spinner /></>;
  if (draw.error || !draw.data) return <><PageHeader title="Book Ticket" /><ErrorBox error={draw.error} retry={() => draw.refetch()} /></>;
  const d = draw.data;
  const max = taken.data?.maxTickets ?? d.maxTickets;
  const sold = taken.data?.taken.length ?? d.soldCount;
  const closed = d.status !== 'open';
  const poor = balance < d.ticketPrice;
  const ready = (random || picked !== null) && !closed && !d.myTicketNo && !poor && sold < max;

  return (
    <div>
      <PageHeader title="Book Ticket" style={themeGradient(d.theme)} />
      <div className="space-y-4 p-4 md:mx-auto md:grid md:max-w-5xl md:grid-cols-[1fr_340px] md:grid-rows-[auto_1fr] md:gap-x-6 md:gap-y-4 md:space-y-0 md:px-6 md:pb-12 md:[grid-template-areas:'grid_info'_'grid_actions']">
        <div className="space-y-4 md:[grid-area:info]">
        <Item className="rounded-card p-3 text-white shadow-card md:p-4" style={themeGradient(d.theme)}>
          <div className="flex items-center justify-between">
            <div className="text-lg font-bold">{d.packageName} Draw</div>
            <ModeBadge mode={d.mode} />
          </div>
          <div className="flex justify-between text-xs text-white/85">
            <span>{fmtDateTime(d.drawTime)}</span>
            <span>⏱ <Countdown target={d.drawTime} serverTime={d.serverTime} /></span>
          </div>
        </Item>

        {d.myTicketNo && <Item className="rounded-btn bg-brand-light p-3 text-center text-sm font-semibold text-brand-dark">You already hold ticket #{ticketLabel(d.myTicketNo)} in this draw.</Item>}
        {closed && <Item className="rounded-btn bg-red-50 p-3 text-center text-sm font-semibold text-bad">Ticket sales for this draw are closed.</Item>}
        </div>

        <Item className="md:rounded-card md:bg-white md:p-5 md:shadow-card md:[grid-area:grid]">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Select Number</h2>
            <span className="text-xs text-muted">{Math.max(0, max - sold)} of {max} left</span>
          </div>
          {offers.length === 0 ? (
            <p className="py-6 text-center text-sm font-semibold text-muted">All tickets are sold.</p>
          ) : (
            <div className="grid grid-cols-5 gap-1.5 min-[380px]:gap-2">
              <AnimatePresence mode="popLayout" initial={false}>
                {offers.map((n) => {
                  const sel = picked === n && !random;
                  return (
                    <motion.button
                      key={n} disabled={closed || !!d.myTicketNo}
                      onClick={() => { setPick(n); setRandom(false); }}
                      aria-pressed={sel}
                      whileTap={{ scale: 0.85 }}
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: sel ? 1.1 : 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                      className={`rounded-lg border py-3 text-[11px] font-semibold tabular-nums min-[380px]:text-sm disabled:opacity-50 ${
                        sel ? 'border-bad bg-bad text-white shadow-glow' : 'border-brand/30 bg-white text-brand-dark'}`}
                    >
                      {ticketLabel(n)}
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
          <p className="mt-2 text-center text-[11px] text-muted">Sold numbers are swapped for fresh ones automatically.</p>
        </Item>

        <div className="space-y-4 md:sticky md:top-24 md:[grid-area:actions]">
        <motion.button
          variants={itemV} whileTap={{ scale: 0.96 }}
          disabled={closed || !!d.myTicketNo}
          onClick={() => { setRandom(!random); setPick(null); }}
          aria-pressed={random}
          className={`w-full rounded-btn border-2 py-3 font-semibold ${random ? 'border-bad bg-red-50 text-bad' : 'border-brand/30 bg-white text-brand'} disabled:opacity-50`}
        >
          <motion.span animate={random ? { rotate: [0, 360] } : { rotate: 0 }} transition={{ duration: 0.5 }} className="mr-1 inline-block">🎲</motion.span>
          Random Number {random && '✓'}
        </motion.button>

        <Item className="space-y-1 rounded-card bg-white p-4 text-sm shadow-card">
          <div className="flex justify-between"><span className="text-muted">Your ticket</span><b>{random ? 'Random (assigned by server)' : picked ? `#${ticketLabel(picked)}` : 'Not selected'}</b></div>
          <div className="flex justify-between"><span className="text-muted">Total (1 ticket)</span><Coins n={d.ticketPrice} /></div>
          <div className="flex justify-between"><span className="text-muted">Your balance</span><Coins n={balance} /></div>
          <AnimatePresence>{poor && <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden pt-1 text-xs font-semibold text-bad">Not enough coins. Claim your free daily coins in the Wallet.</motion.p>}</AnimatePresence>
        </Item>

        <Button disabled={!ready || buy.isPending} onClick={() => buy.mutate()}>
          {buy.isPending ? 'Booking…' : <>Confirm · <Coins n={d.ticketPrice} className="text-white" /></>}
        </Button>
        <p className="text-center text-[11px] text-muted">Confirming deducts coins from your wallet. Play coins only, no real value.</p>
        </div>
      </div>
    </div>
  );
}
