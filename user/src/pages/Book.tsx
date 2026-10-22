import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Item } from '../components/motion';
import { useToast } from '../components/Toast';
import { Button, Coins, Countdown, ErrorBox, ModeBadge, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime, ticketLabel } from '../lib/time';
import type { Draw } from '../lib/types';
import { DRAW_PACKAGE_COLORS, themeGradient } from '../theme';

const MAX_QTY = 10;

export function Book() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { balance } = useAuth();
  const [picks, setPicks] = useState<(number | undefined)[]>([undefined]);
  const [quantity, setQuantity] = useState(1);
  const [activePick, setActivePick] = useState(0);
  const [random, setRandom] = useState(false);

  const draw = useQuery({
    queryKey: ['draw', id],
    queryFn: () => api<Draw>(`/draws/${id}`),
    refetchInterval: 5000,
  });
  const tickets = useQuery({
    queryKey: ['taken', id],
    queryFn: () => api<{ maxTickets: number; taken: number[]; offers: number[] }>(`/draws/${id}/tickets`),
    refetchInterval: 4000,
  });
  const takenNumbers = useMemo(() => new Set(tickets.data?.taken ?? []), [tickets.data?.taken]);

  const refreshData = () => {
    ['me', 'wallet', 'tickets', 'draw', 'taken', 'packages'].forEach((key) => {
      void queryClient.invalidateQueries({ queryKey: [key] });
    });
  };
  const resetSelection = () => {
    setPicks([undefined]);
    setQuantity(1);
    setActivePick(0);
    setRandom(false);
  };

  const booking = useMutation({
    mutationFn: async () => {
      const booked: number[] = [];
      try {
        for (let i = 0; i < quantity; i++) {
          const response = await api<{ ticketNo: number; balance: number }>(`/draws/${id}/buy`, {
            body: random ? { random: true } : { ticketNo: picks[i] },
            headers: { 'Idempotency-Key': crypto.randomUUID() },
          });
          booked.push(response.ticketNo);
        }
      } catch (error) {
        throw Object.assign(error instanceof Error ? error : new Error('Could not book tickets'), { booked });
      }
      return booked;
    },
    onSuccess: (booked) => {
      toast(booked.length === 1 ? `Ticket #${ticketLabel(booked[0])} booked!` : `${booked.length} tickets booked!`, 'success');
      refreshData();
      resetSelection();
    },
    onError: (error) => {
      const booked = (error as Error & { booked?: number[] }).booked ?? [];
      const partialMessage = booked.length ? ` (${booked.length} ticket${booked.length === 1 ? '' : 's'} already booked)` : '';
      toast(`${error instanceof Error ? error.message : 'Could not book tickets'}${partialMessage}`, 'error');
      refreshData();
    },
  });

  if (draw.isLoading || tickets.isLoading) return <><PageHeader title="Book Ticket" /><Spinner /></>;
  if (draw.error || !draw.data) return <><PageHeader title="Book Ticket" /><ErrorBox error={draw.error} retry={() => draw.refetch()} /></>;
  if (tickets.error || !tickets.data) return <><PageHeader title="Book Ticket" /><ErrorBox error={tickets.error} retry={() => tickets.refetch()} /></>;

  const currentDraw = draw.data;
  const maxTickets = tickets.data.maxTickets;
  const closed = currentDraw.status !== 'open';
  const packageColors = DRAW_PACKAGE_COLORS[currentDraw.packageName.trim()];
  const bookingTheme = packageColors
    ? { background: `linear-gradient(180deg, ${packageColors[0]}, ${packageColors[2]})` }
    : themeGradient(currentDraw.theme);
  const selectedStyle = packageColors
    ? {
        borderColor: packageColors[2],
        backgroundColor: `${packageColors[0]}1a`,
        color: packageColors[2],
      }
    : undefined;
  const selectedNumberStyle = packageColors
    ? {
        borderColor: packageColors[2],
        backgroundColor: packageColors[2],
        color: '#fff',
        boxShadow: `0 4px 12px ${packageColors[3]}55`,
      }
    : undefined;
  const total = currentDraw.ticketPrice * quantity;
  const insufficientBalance = balance < total;
  const filledPicks = picks.filter((pick): pick is number => pick !== undefined);
  const ready = (random || filledPicks.length === quantity) && !closed && !insufficientBalance;
  const offers = tickets.data.offers.filter((number) => !takenNumbers.has(number)).slice(0, 10);

  const updateQuantity = (nextQuantity: number) => {
    const next = Math.min(MAX_QTY, Math.max(1, nextQuantity));
    setPicks((current) => Array.from({ length: next }, (_, index) => current[index]));
    setActivePick(next > quantity ? next - 1 : Math.min(activePick, next - 1));
    setQuantity(next);
  };

  const togglePick = (number: number) => {
    setRandom(false);
    const nextPicks = Array.from({ length: quantity }, (_, index) => picks[index]);
    const existingIndex = nextPicks.indexOf(number);
    if (existingIndex === activePick) {
      nextPicks[activePick] = undefined;
      setPicks(nextPicks);
      return;
    }
    if (existingIndex !== -1) {
      setActivePick(existingIndex);
      return;
    }
    nextPicks[activePick] = number;
    setPicks(nextPicks);
    const nextEmpty = nextPicks.findIndex((pick, index) => index !== activePick && pick === undefined);
    if (nextEmpty !== -1) setActivePick(nextEmpty);
  };

  return (
    <div>
      <PageHeader title="Book Ticket" style={bookingTheme} />
      <div className="space-y-4 p-4 md:mx-auto md:grid md:max-w-5xl md:grid-cols-[1fr_340px] md:items-start md:gap-6 md:space-y-0 md:px-6 md:pb-12">
        <div className="space-y-4">
          <Item className="rounded-card p-3 text-white shadow-card md:p-4" style={bookingTheme}>
            <div className="flex items-center justify-between">
              <div className="text-lg font-bold">{currentDraw.packageName} Draw</div>
              <ModeBadge mode={currentDraw.mode} />
            </div>
            <div className="flex justify-between text-xs text-white/85">
              <span>{fmtDateTime(currentDraw.drawTime)}</span>
              <span>⏱ <Countdown target={currentDraw.drawTime} serverTime={currentDraw.serverTime} /></span>
            </div>
          </Item>

          {currentDraw.myTicketNo && (
            <Item className="rounded-btn bg-brand-light p-3 text-center text-sm font-semibold text-brand-dark">
              Aapke paas is draw ka ticket #{ticketLabel(currentDraw.myTicketNo)} hai. Aur ticket bhi le sakte ho.
            </Item>
          )}
          {closed && (
            <Item className="rounded-btn bg-red-50 p-3 text-center text-sm font-semibold text-bad">
              Ticket sales for this draw are closed.
            </Item>
          )}

          <Item className="rounded-card bg-white p-3 shadow-card md:p-5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="font-semibold">
                Select Number{quantity > 1 ? 's' : ''}{' '}
                <span className="text-xs font-normal text-muted">({filledPicks.length}/{quantity})</span>
              </h2>
              <span className="shrink-0 text-xs text-muted">{Math.max(0, maxTickets - takenNumbers.size)} of {maxTickets} left</span>
            </div>
            {offers.length === 0 ? (
              <p className="py-6 text-center text-sm font-semibold text-muted">No ticket numbers are currently available.</p>
            ) : (
              <div className="grid grid-cols-5 gap-1.5 min-[380px]:gap-2">
                <AnimatePresence mode="popLayout" initial={false}>
                  {offers.map((number) => {
                    const selected = picks.includes(number) && !random;
                    return (
                      <motion.button
                        key={number}
                        type="button"
                        disabled={closed}
                        onClick={() => togglePick(number)}
                        aria-pressed={selected}
                        whileTap={{ scale: 0.88 }}
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: selected ? 1.06 : 1 }}
                        exit={{ opacity: 0, scale: 0.6 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 24 }}
                        className={`rounded-lg border py-2.5 text-[11px] font-semibold tabular-nums min-[380px]:text-sm disabled:opacity-50 ${
                          selected
                            ? packageColors ? 'text-white' : 'border-bad bg-bad text-white shadow-glow'
                            : 'border-brand/30 bg-white text-brand-dark'
                        }`}
                        style={selected ? selectedNumberStyle : undefined}
                      >
                        {ticketLabel(number)}
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </Item>
        </div>

        <div className="space-y-4 md:sticky md:top-24">
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            disabled={closed}
            onClick={() => {
              setRandom((current) => !current);
              setPicks(Array.from({ length: quantity }, () => undefined));
              setActivePick(0);
            }}
            aria-pressed={random}
            className={`w-full rounded-btn border-2 py-3 font-semibold ${
              random
                ? packageColors ? '' : 'border-bad bg-red-50 text-bad'
                : 'border-brand/30 bg-white text-brand'
            } disabled:opacity-50`}
            style={random ? selectedStyle : undefined}
          >
            <motion.span
              animate={random ? { rotate: [0, 360] } : { rotate: 0 }}
              transition={{ duration: 0.5 }}
              className="mr-1 inline-block"
            >
              🎲
            </motion.span>
            Random Number {random && '✓'}
          </motion.button>

          <Item className="flex items-center justify-between rounded-card bg-white p-4 shadow-card">
            <span className="text-sm font-semibold">Quantity</span>
            <div className="flex items-center gap-4">
              <button type="button" disabled={closed || quantity <= 1} onClick={() => updateQuantity(quantity - 1)} className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-brand/30 text-xl font-bold text-brand disabled:opacity-40">−</button>
              <span className="w-6 text-center text-lg font-extrabold tabular-nums">{quantity}</span>
              <button type="button" disabled={closed || quantity >= MAX_QTY} onClick={() => updateQuantity(quantity + 1)} className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-brand/30 text-xl font-bold text-brand disabled:opacity-40">+</button>
            </div>
          </Item>

          {!random && (
            <Item className="space-y-2 rounded-card bg-white p-4 shadow-card">
              <div className="text-sm font-semibold">Select Your Numbers</div>
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: quantity }, (_, index) => (
                  <button
                    key={index}
                    type="button"
                    disabled={closed}
                    onClick={() => setActivePick(index)}
                    className={`rounded-btn border-2 px-3 py-2 text-left ${
                      activePick === index
                        ? packageColors ? '' : 'border-bad bg-red-50'
                        : 'border-brand/30 bg-white'
                    }`}
                    style={activePick === index ? selectedStyle : undefined}
                  >
                    <div className="text-[10px] text-muted">Ticket {index + 1}</div>
                    <div className="text-base font-extrabold tabular-nums text-brand-dark">
                      {picks[index] !== undefined ? ticketLabel(picks[index]!) : 'Select'}
                    </div>
                  </button>
                ))}
              </div>
            </Item>
          )}

          <Item className="space-y-2 rounded-card bg-white p-4 text-sm shadow-card">
            <div className="flex justify-between gap-3">
              <span className="shrink-0 text-muted">Your ticket{quantity > 1 ? 's' : ''}</span>
              <b className="text-right">
                {random ? `Random x ${quantity} (assigned by server)` : filledPicks.length ? filledPicks.map((number) => `#${ticketLabel(number)}`).join(', ') : 'Not selected'}
              </b>
            </div>
            <div className="flex justify-between"><span className="text-muted">Total ({quantity} ticket{quantity > 1 ? 's' : ''})</span><Coins n={total} /></div>
            <div className="flex justify-between"><span className="text-muted">Your balance</span><Coins n={balance} /></div>
            <AnimatePresence>
              {insufficientBalance && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden pt-1 text-xs font-semibold text-bad"
                >
                  Not enough coins. Claim your free daily coins in the Wallet.
                </motion.p>
              )}
            </AnimatePresence>
          </Item>

          <Button disabled={!ready || booking.isPending} onClick={() => booking.mutate()}>
            {booking.isPending ? 'Booking…' : <>Confirm · <Coins n={total} className="text-white" /></>}
          </Button>
        </div>
      </div>
    </div>
  );
}
