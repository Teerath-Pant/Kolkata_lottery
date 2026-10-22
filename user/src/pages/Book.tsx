import { useMemo, useState } from 'react';
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

const PAGE = 100;
const MAX_QTY = 10;

export function Book() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { balance } = useAuth();
  const [picks, setPicks] = useState<number[]>([]);
  const [qty, setQty] = useState(1);
  const [random, setRandom] = useState(false);
  const [page, setPage] = useState(0);

  const draw = useQuery({ queryKey: ['draw', id], queryFn: () => api<Draw>(`/draws/${id}`), refetchInterval: 5000 });
  const taken = useQuery({
    queryKey: ['taken', id],
    queryFn: () => api<{ maxTickets: number; taken: number[] }>(`/draws/${id}/tickets`),
    refetchInterval: 4000,
  });
  const takenSet = useMemo(() => new Set(taken.data?.taken ?? []), [taken.data]);

  const refresh = () => ['me', 'wallet', 'tickets', 'draw', 'taken', 'packages'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const buy = useMutation({
    mutationFn: async () => {
      const done: number[] = [];
      try {
        for (let i = 0; i < qty; i++) {
          const r = await api<{ ticketNo: number; balance: number }>(`/draws/${id}/buy`, {
            body: random ? { random: true } : { ticketNo: picks[i] },
            headers: { 'Idempotency-Key': crypto.randomUUID() },
          });
          done.push(r.ticketNo);
        }
      } catch (e) {
        throw Object.assign(e instanceof Error ? e : new Error('Could not book'), { done });
      }
      return done;
    },
    onSuccess: (done) => {
      toast(done.length === 1 ? `Ticket #${ticketLabel(done[0])} booked!` : `${done.length} tickets booked!`, 'success');
      refresh();
      nav('/tickets', { replace: true });
    },
    onError: (e) => {
      const done = (e as { done?: number[] }).done ?? [];
      toast(`${e instanceof Error ? e.message : 'Could not book'}${done.length ? ` (${done.length} ticket book ho chuke)` : ''}`, 'error');
      refresh();
      setPicks([]);
    },
  });

  if (draw.isLoading || taken.isLoading) return <><PageHeader title="Book Ticket" /><Spinner /></>;
  if (draw.error || !draw.data) return <><PageHeader title="Book Ticket" /><ErrorBox error={draw.error} retry={() => draw.refetch()} /></>;
  const d = draw.data;
  const max = taken.data?.maxTickets ?? d.maxTickets;
  const pages = Math.ceil(max / PAGE);
  const nums = Array.from({ length: Math.min(PAGE, max - page * PAGE) }, (_, i) => page * PAGE + i + 1);
  const closed = d.status !== 'open';
  const total = d.ticketPrice * qty;
  const poor = balance < total;
  const locked = closed;
  const ready = (random || picks.length === qty) && !locked && !poor;

  const changeQty = (n: number) => {
    const v = Math.min(MAX_QTY, Math.max(1, n));
    setQty(v);
    setPicks((p) => p.slice(0, v));
  };
  const togglePick = (n: number) => {
    setRandom(false);
    setPicks((p) => {
      if (p.includes(n)) return p.filter((x) => x !== n);
      if (p.length >= qty) return [...p.slice(1), n]; // purana hata ke naya
      return [...p, n];
    });
  };

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

       {d.myTicketNo && <Item className="rounded-btn bg-brand-light p-3 text-center text-sm font-semibold text-brand-dark">Aapke paas is draw ka ticket #{ticketLabel(d.myTicketNo)} hai. Aur ticket bhi le sakte ho.</Item>}
        {closed && <Item className="rounded-btn bg-red-50 p-3 text-center text-sm font-semibold text-bad">Ticket sales for this draw are closed.</Item>}
        </div>

        <Item className="md:rounded-card md:bg-white md:p-5 md:shadow-card md:[grid-area:grid]">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Select Number{qty > 1 ? 's' : ''} <span className="text-xs font-normal text-muted">({picks.length}/{qty})</span></h2>
            <span className="text-xs text-muted">{max - takenSet.size} free of {max}</span>
          </div>
          <motion.div key={page} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }} className="grid grid-cols-4 gap-1.5 min-[380px]:gap-2 sm:grid-cols-6 lg:grid-cols-8">
            {nums.map((n) => {
              const isTaken = takenSet.has(n);
              const sel = picks.includes(n) && !random;
              return (
                <motion.button
                  key={n} disabled={isTaken || locked}
                  onClick={() => togglePick(n)}
                  aria-pressed={sel}
                  whileTap={isTaken ? undefined : { scale: 0.85 }}
                  animate={{ scale: sel ? 1.1 : 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                  className={`rounded-lg border py-2 text-[11px] font-semibold tabular-nums min-[380px]:text-xs ${
                    isTaken ? 'border-line bg-gray-100 text-gray-300 line-through'
                    : sel ? 'border-bad bg-bad text-white shadow-glow' : 'border-brand/30 bg-white text-brand-dark'}`}
                >
                  {ticketLabel(n)}
                </motion.button>
              );
            })}
          </motion.div>
          {pages > 1 && (
            <div className="mt-3 flex items-center justify-center gap-3 text-sm">
              <button disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-btn border px-3 py-1 disabled:opacity-40">‹ Prev</button>
              <span className="text-muted">{page * PAGE + 1}–{Math.min(max, (page + 1) * PAGE)}</span>
              <button disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className="rounded-btn border px-3 py-1 disabled:opacity-40">Next ›</button>
            </div>
          )}
        </Item>

        <div className="space-y-4 md:sticky md:top-24 md:[grid-area:actions]">
        <motion.button
          variants={itemV} whileTap={{ scale: 0.96 }}
          disabled={locked}
          onClick={() => { setRandom(!random); setPicks([]); }}
          aria-pressed={random}
          className={`w-full rounded-btn border-2 py-3 font-semibold ${random ? 'border-bad bg-red-50 text-bad' : 'border-brand/30 bg-white text-brand'} disabled:opacity-50`}
        >
          <motion.span animate={random ? { rotate: [0, 360] } : { rotate: 0 }} transition={{ duration: 0.5 }} className="mr-1 inline-block">🎲</motion.span>
          Random Number {random && '✓'}
        </motion.button>

        {/* Quantity */}
        <Item className="flex items-center justify-between rounded-card bg-white p-4 shadow-card">
          <span className="text-sm font-semibold">Quantity</span>
          <div className="flex items-center gap-4">
            <button type="button" disabled={locked || qty <= 1} onClick={() => changeQty(qty - 1)} className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-brand/30 text-xl font-bold text-brand disabled:opacity-40">−</button>
            <span className="w-6 text-center text-lg font-extrabold tabular-nums">{qty}</span>
            <button type="button" disabled={locked || qty >= MAX_QTY} onClick={() => changeQty(qty + 1)} className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-brand/30 text-xl font-bold text-brand disabled:opacity-40">+</button>
          </div>
        </Item>

        <Item className="space-y-1 rounded-card bg-white p-4 text-sm shadow-card">
          <div className="flex justify-between gap-3">
            <span className="shrink-0 text-muted">Your ticket{qty > 1 ? 's' : ''}</span>
            <b className="text-right">
              {random ? `Random x ${qty} (assigned by server)` : picks.length ? picks.map((n) => `#${ticketLabel(n)}`).join(', ') : 'Not selected'}
            </b>
          </div>
          <div className="flex justify-between"><span className="text-muted">Total ({qty} ticket{qty > 1 ? 's' : ''})</span><Coins n={total} /></div>
          <div className="flex justify-between"><span className="text-muted">Your balance</span><Coins n={balance} /></div>
          <AnimatePresence>{poor && <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden pt-1 text-xs font-semibold text-bad">Not enough coins. Claim your free daily coins in the Wallet.</motion.p>}</AnimatePresence>
        </Item>

        <Button disabled={!ready || buy.isPending} onClick={() => buy.mutate()}>
          {buy.isPending ? 'Booking…' : <>Confirm · <Coins n={total} className="text-white" /></>}
        </Button>
        <p className="text-center text-[11px] text-muted">Confirming deducts coins from your wallet. Play coins only, no real value.</p>
        </div>
      </div>
    </div>
  );
}