import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Item } from '../components/motion';
import { Celebration } from '../components/Celebration';
import { prizeText } from '../components/PackageCard';
import { useToast } from '../components/Toast';
import { Button, Coins, Countdown, ErrorBox, ModeBadge, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { fmtDateTime, ticketLabel } from '../lib/time';
import type { Draw } from '../lib/types';
import { themeGradient } from '../theme';

const HOW = [
  'Each draw sells one ticket per player.',
  'Pick a free number from the grid, or tap Random Number and let the server choose.',
  'Tickets cost play coins. Coins have no real-world value and cannot be cashed out.',
  'At draw time the winning ticket is announced and the prize coins are credited automatically.',
  'The draw mode (Random draw / Admin-selected winner) is shown on this screen. Random draws are provably fair: verify any result on the Verify page.',
  'If too few tickets are sold, the draw is cancelled and everyone is refunded.',
];

export function DrawPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [panel, setPanel] = useState<'prize' | 'how' | null>(null);
  const [party, setParty] = useState(false);
  const prev = useRef<string | null>(null);

  const q = useQuery({
    queryKey: ['draw', id],
    queryFn: () => api<Draw>(`/draws/${id}`),
    // poll fast around draw time so the winner appears within a few seconds
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d || d.status === 'completed' || d.status === 'cancelled') return false;
      return Date.parse(d.drawTime) - Date.now() < 90_000 ? 2000 : 5000;
    },
  });
  const d = q.data;

  useEffect(() => {
    if (!d) return;
    const was = prev.current;
    prev.current = d.status;
    if (was && was !== d.status && (d.status === 'completed' || d.status === 'cancelled')) {
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      if (d.iWon) setParty(true);
      else if (d.status === 'completed') toast(`Winning ticket: #${ticketLabel(d.winningTicketNo!)}`, 'info');
      else toast('Draw cancelled. Any tickets were refunded.', 'info');
    }
  }, [d, qc, toast]);

  if (q.isLoading) return <><PageHeader title="Draw" back="/" /><Spinner /></>;
  if (q.error || !d) return <><PageHeader title="Draw" back="/" /><ErrorBox error={q.error} retry={() => q.refetch()} /></>;

  const open = d.status === 'open';
  const goNext = async () => {
    try { nav(`/draw/${(await api<Draw>(`/packages/${d.packageId}/current-draw`)).id}`, { replace: true }); }
    catch (e) { toast(e instanceof Error ? e.message : 'No open draw yet', 'error'); }
  };

  return (
    <div className="min-h-screen" style={themeGradient(d.theme)}>
      <PageHeader title={`${d.packageName} Draw`} back="/" keep style={{ background: 'transparent' }} />
      {party && <Celebration ticketNo={d.winningTicketNo!} prize={d.prizeAmount} onClose={() => setParty(false)} />}

      <div className="px-4 pb-6 md:mx-auto md:grid md:max-w-5xl md:grid-cols-2 md:items-start md:gap-6 md:px-6 md:pb-12">
        <div className="space-y-4">
        <Item className="relative rounded-card border-4 border-gold bg-black/20 p-4 text-center text-white shadow-glow min-[380px]:p-5 md:py-10">
          <motion.div animate={{ y: [0, -5, 0], rotate: [-4, 4, -4] }} transition={{ repeat: Infinity, duration: 2.6 }} className="absolute -top-6 left-1/2 -ml-5 text-4xl" aria-hidden>👑</motion.div>
          <div className="mt-2 text-xs font-semibold uppercase tracking-widest text-gold">{prizeText(d) ?? 'Grand prize'}</div>
          <div className="text-3xl font-extrabold min-[380px]:text-4xl md:text-5xl"><Coins n={d.prizeAmount} size={30} className="font-extrabold" /></div>
          <div className="mt-2"><ModeBadge mode={d.mode} /></div>
          <div className="mt-3 text-xs text-white/80">Draw date &amp; time</div>
          <div className="font-semibold">{fmtDateTime(d.drawTime)}</div>
        </Item>

        {open && (
          <Item className="rounded-card bg-white/95 p-4 text-center shadow-card">
            <div className="text-xs text-muted">Draw closes in</div>
            <div className="text-3xl font-extrabold text-brand-dark"><Countdown target={d.drawTime} serverTime={d.serverTime} /></div>
            <div className="text-xs text-muted">{d.soldCount}/{d.maxTickets} tickets sold</div>
            <div className="mt-2 h-2 overflow-hidden rounded-pill bg-brand-light">
              <motion.div className="h-full rounded-pill bg-gradient-to-r from-brand to-bad" initial={{ width: 0 }} animate={{ width: `${Math.min(100, (d.soldCount / d.maxTickets) * 100)}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
            </div>
          </Item>
        )}

        {d.status === 'completed' && (
          <Item className="rounded-card bg-white p-4 text-center shadow-card">
            <div className="text-xs font-semibold uppercase text-muted">Winning ticket</div>
            <motion.div initial={{ scale: 0.3, rotate: -10, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 12, delay: 0.2 }}
              className="text-4xl font-extrabold tracking-widest text-bad">#{ticketLabel(d.winningTicketNo!)}</motion.div>
            <div className="text-sm text-muted">Winner {d.winnerName} · <Coins n={d.prizeAmount} /></div>
            {d.iWon && <div className="mt-2 rounded-btn bg-gold-light py-2 font-bold text-[#6b4a00]">🎉 That is your ticket! Prize credited.</div>}
            <Link to={`/verify/${d.id}`} className="mt-2 inline-block text-sm font-semibold text-brand underline">Verify this result</Link>
          </Item>
        )}
        {d.status === 'cancelled' && (
          <Item className="rounded-card bg-white p-4 text-center text-sm shadow-card">
            Draw cancelled (not enough tickets sold). Tickets were refunded.
          </Item>
        )}
        </div>

        <div className="mt-4 space-y-4 md:mt-0">

        <Item className="rounded-card bg-white p-3 shadow-card">
          <div className="text-center text-xs text-muted">Ticket price</div>
          <div className="mb-2 text-center text-2xl font-bold"><Coins n={d.ticketPrice} size={22} /></div>
          {open && (d.myTicketNo
            ? <div className="rounded-btn bg-brand-light py-3 text-center font-bold text-brand-dark">Your ticket: #{ticketLabel(d.myTicketNo)}</div>
            : <Button onClick={() => nav(`/book/${d.id}`)}>Book Now</Button>)}
          {!open && <Button onClick={goNext}>Go to next draw</Button>}
        </Item>

        <Item className="rounded-card bg-black/25 p-3 text-[11px] text-white/90">
          <div className="font-semibold">Provably fair commitment (SHA-256 of server seed)</div>
          <button className="mt-1 block w-full break-all text-left font-mono" onClick={() => { navigator.clipboard?.writeText(d.serverSeedHash); toast('Hash copied', 'success'); }}>
            {d.serverSeedHash}
          </button>
          {d.serverSeed && <div className="mt-1 break-all"><span className="font-semibold">Revealed seed:</span> <span className="font-mono">{d.serverSeed}</span></div>}
        </Item>

        <Item className="grid grid-cols-3 gap-2 rounded-card bg-white p-2 text-center text-[11px] font-medium shadow-card">
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => setPanel(panel === 'prize' ? null : 'prize')} className="rounded-btn py-2"><div className="text-xl">🏅</div>Prize Details</motion.button>
          <motion.div whileTap={{ scale: 0.9 }}><Link to={`/results?packageId=${d.packageId}`} className="block rounded-btn py-2"><div className="text-xl">📋</div>Past Results</Link></motion.div>
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => setPanel(panel === 'how' ? null : 'how')} className="rounded-btn py-2"><div className="text-xl">❓</div>How to Play</motion.button>
        </Item>

        <AnimatePresence mode="wait" initial={false}>
        {panel === 'prize' && (
          <motion.div key="prize" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden rounded-card bg-white p-4 text-sm shadow-card">
            <p><b>Prize:</b> {d.prizeType === 'fixed' ? <Coins n={d.prizeValue} /> : `${d.prizeValue}% of the ticket pool (now `}{d.prizeType !== 'fixed' && <><Coins n={d.prizeAmount} />)</>}</p>
            <p><b>Tickets:</b> max {d.maxTickets}, minimum {d.minTickets} needed or the draw is cancelled &amp; refunded.</p>
            <p><b>Winner selection:</b> {d.mode === 'random' ? 'Random (HMAC of a pre-committed server seed).' : 'Chosen by the admin before draw time.'}</p>
          </motion.div>
        )}
        {panel === 'how' && (
          <motion.ol key="how" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="list-decimal space-y-1 overflow-hidden rounded-card bg-white p-4 pl-8 text-sm shadow-card">{HOW.map((h) => <li key={h}>{h}</li>)}</motion.ol>
        )}
        </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
