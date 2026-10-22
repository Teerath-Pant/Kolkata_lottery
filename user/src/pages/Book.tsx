import { useState } from 'react';
import { useParams } from 'react-router-dom';
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

const MAX_QTY = 10;

export function Book() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const { balance } = useAuth();
  const [picks, setPicks] = useState<(number | undefined)[]>([]);
  const [qty, setQty] = useState(1);
  const [active, setActive] = useState(0); // which "Your numbers" box the next tapped number fills
  const [random, setRandom] = useState(false);

  const draw = useQuery({ queryKey: ['draw', id], queryFn: () => api<Draw>(`/draws/${id}`), refetchInterval: 5000 });
  const taken = useQuery({
    queryKey: ['taken', id],
    queryFn: () => api<{ maxTickets: number; taken: number[]; offers: number[] }>(`/draws/${id}/tickets`),
    refetchInterval: 4000,
  });
  const offers = taken.data?.offers ?? [];
  // a picked number someone else just bought drops out of the offers -> that box goes back to empty
  const live = Array.from({ length: qty }, (_, i) => (picks[i] !== undefined && offers.includes(picks[i]!) ? picks[i] : undefined));
  const filled = live.filter((n): n is number => n !== undefined);

  const refresh = () => ['me', 'wallet', 'tickets', 'draw', 'taken', 'packages'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const reset = () => { setPicks([]); setQty(1); setActive(0); setRandom(false); };

  // One buy request per ticket, each with its own Idempotency-Key. On a failure the tickets already bought stay bought.
  const buy = useMutation({
    mutationFn: async () => {
      const done: number[] = [];
      try {
        for (let i = 0; i < qty; i++) {
          const r = await api<{ ticketNo: number; balance: number }>(`/draws/${id}/buy`, {
            body: random ? { random: true } : { ticketNo: live[i] },
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
      toast(done.length === 1 ? `Ticket #${ticketLabel(done[0])} booked! You can book more.` : `${done.length} tickets booked! You can book more.`, 'success');
      refresh();
      reset(); // stay on this page for the next purchase
    },
    onError: (e) => {
      const done = (e as { done?: number[] }).done ?? [];
      toast(`${e instanceof Error ? e.message : 'Could not book'}${done.length ? ` (${done.length} ticket${done.length > 1 ? 's' : ''} already booked)` : ''}`, 'error');
      refresh();
      setPicks([]);
      setActive(0);
    },
  });

  if (draw.isLoading || taken.isLoading) return <><PageHeader title="Book Ticket" /><Spinner /></>;
  if (draw.error || !draw.data) return <><PageHeader title="Book Ticket" /><ErrorBox error={draw.error} retry={() => draw.refetch()} /></>;
  const d = draw.data;
  const max = taken.data?.maxTickets ?? d.maxTickets;
  const sold = taken.data?.taken.length ?? d.soldCount;
  const left = Math.max(0, max - sold);
  const closed = d.status !== 'open';
  const total = d.ticketPrice * qty;
  const poor = balance < total;
  const ready = (random || filled.length === qty) && !closed && !poor && qty <= left;

  const changeQty = (n: number) => {
    const v = Math.min(MAX_QTY, Math.max(1, n));
    setPicks((p) => p.slice(0, v));
    setActive(v > qty ? v - 1 : Math.min(active, v - 1));
    setQty(v);
  };

  const togglePick = (n: number) => {
    setRandom(false);
    const at = live.indexOf(n);
    if (at === active) { // tapped the number of the active box again: empty it
      setPicks(() => { const x = [...live]; x[active] = undefined; return x; });
      return;
    }
    if (at !== -1) { setActive(at); return; } // number already sits in another box: jump to that box
    setPicks(() => { const x = [...live]; x[active] = n; return x; });
    const nextEmpty = Array.from({ length: qty }, (_, i) => i).find((i) => i !== active && live[i] === undefined);
    if (nextEmpty !== undefined) setActive(nextEmpty);
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

          {d.myTicketNos.length > 0 && (
            <Item className="rounded-btn bg-brand-light p-3 text-center text-sm font-semibold text-brand-dark">
              You hold {d.myTicketNos.length} ticket{d.myTicketNos.length > 1 ? 's' : ''} in this draw: {d.myTicketNos.map((n) => `#${ticketLabel(n)}`).join(', ')}. You can book more.
            </Item>
          )}
          {closed && <Item className="rounded-btn bg-red-50 p-3 text-center text-sm font-semibold text-bad">Ticket sales for this draw are closed.</Item>}
        </div>

        <Item className="md:rounded-card md:bg-white md:p-5 md:shadow-card md:[grid-area:grid]">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">
              Select Number{qty > 1 ? 's' : ''} <span className="text-xs font-normal text-muted">({filled.length}/{qty})</span>
            </h2>
            <span className="text-xs text-muted">{left} of {max} left</span>
          </div>
          {offers.length === 0 ? (
            <p className="py-6 text-center text-sm font-semibold text-muted">All tickets are sold.</p>
          ) : (
            <div className="grid grid-cols-5 gap-1.5 min-[380px]:gap-2">
              <AnimatePresence mode="popLayout" initial={false}>
                {offers.map((n) => {
                  const sel = live.includes(n) && !random;
                  return (
                    <motion.button
                      key={n} disabled={closed}
                      onClick={() => togglePick(n)}
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
            disabled={closed}
            onClick={() => { setRandom(!random); setPicks([]); }}
            aria-pressed={random}
            className={`w-full rounded-btn border-2 py-3 font-semibold ${random ? 'border-bad bg-red-50 text-bad' : 'border-brand/30 bg-white text-brand'} disabled:opacity-50`}
          >
            <motion.span animate={random ? { rotate: [0, 360] } : { rotate: 0 }} transition={{ duration: 0.5 }} className="mr-1 inline-block">🎲</motion.span>
            Random Number {random && '✓'}
          </motion.button>

          <Item className="flex items-center justify-between rounded-card bg-white p-4 shadow-card">
            <span className="text-sm font-semibold">Quantity</span>
            <div className="flex items-center gap-4">
              <button type="button" aria-label="Fewer tickets" disabled={closed || qty <= 1} onClick={() => changeQty(qty - 1)} className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-brand/30 text-xl font-bold text-brand disabled:opacity-40">−</button>
              <span className="w-6 text-center text-lg font-extrabold tabular-nums">{qty}</span>
              <button type="button" aria-label="More tickets" disabled={closed || qty >= Math.min(MAX_QTY, left)} onClick={() => changeQty(qty + 1)} className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-brand/30 text-xl font-bold text-brand disabled:opacity-40">+</button>
            </div>
          </Item>

          {!random && qty > 1 && (
            <Item className="space-y-2 rounded-card bg-white p-4 shadow-card">
              <div className="text-sm font-semibold">Your numbers</div>
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: qty }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={closed}
                    onClick={() => setActive(i)}
                    className={`rounded-btn border-2 px-3 py-2 text-left ${active === i ? 'border-bad bg-red-50' : 'border-brand/30 bg-white'}`}
                  >
                    <div className="text-[10px] text-muted">Ticket {i + 1}</div>
                    <div className="text-base font-extrabold tabular-nums text-brand-dark">{live[i] !== undefined ? ticketLabel(live[i]!) : 'Pick'}</div>
                  </button>
                ))}
              </div>
            </Item>
          )}

          <Item className="space-y-1 rounded-card bg-white p-4 text-sm shadow-card">
            <div className="flex justify-between gap-3">
              <span className="shrink-0 text-muted">Your ticket{qty > 1 ? 's' : ''}</span>
              <b className="text-right">
                {random ? `Random${qty > 1 ? ` x ${qty}` : ''} (assigned by server)` : filled.length ? filled.map((n) => `#${ticketLabel(n)}`).join(', ') : 'Not selected'}
              </b>
            </div>
            <div className="flex justify-between"><span className="text-muted">Total ({qty} ticket{qty > 1 ? 's' : ''})</span><Coins n={total} /></div>
            <div className="flex justify-between"><span className="text-muted">Your balance</span><Coins n={balance} /></div>
            <AnimatePresence>
              {(poor || qty > left) && (
                <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden pt-1 text-xs font-semibold text-bad">
                  {poor ? 'Not enough coins.' : `Only ${left} ticket${left === 1 ? '' : 's'} left.`}
                </motion.p>
              )}
            </AnimatePresence>
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
