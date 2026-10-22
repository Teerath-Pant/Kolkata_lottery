import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Celebration } from '../components/Celebration';
import { prizeText } from '../components/PackageCard';
import { useToast } from '../components/Toast';
import { Button, Coins, Countdown, ErrorBox, ModeBadge, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { fmtDateTime, ticketLabel } from '../lib/time';
import type { Draw } from '../lib/types';
import { themeGradient } from '../theme';

const HOW = [
  'Buy as many tickets as you like, one number per ticket.',
  'Pick a free number from the grid, or tap Random Number and let the server choose.',
  'Tickets cost play coins. Coins have no real-world value and cannot be cashed out.',
  'At draw time the winning ticket is announced and the prize coins are credited automatically.',
  'The draw mode (Random draw / Admin-selected winner) is shown on this screen. Random draws are provably fair: verify any result on the Verify page.',
  'If too few tickets are sold, the draw is cancelled and everyone is refunded.',
];

// Sequence (Name admin mein bilkul aise hi hona chahiye)
const ORDER = ['1 करोड़', '2 करोड़', '5 लाख', '10 लाख', '20 लाख'];
const LABELS = ['GRAND PRIZE', 'MEGA PRIZE', 'SPECIAL PRIZE', 'SPECIAL PRIZE', 'SUPER PRIZE'];
// [light, dark, button, deep shadow]
const COLORS: [string, string, string, string][] = [
  ['#ef4444', '#7f1d1d', '#dc2626', '#7f1d1d'],
  ['#3b82f6', '#1e3a8a', '#2563eb', '#1e3a8a'],
  ['#22c55e', '#14532d', '#16a34a', '#14532d'],
  ['#a855f7', '#4c1d95', '#7c3aed', '#4c1d95'],
  ['#ec4899', '#831843', '#db2777', '#831843'],
];

// 3D text: gold gradient + layered shadow
const bigText: React.CSSProperties = {
  background: 'linear-gradient(180deg, #fff3b0 0%, #ffd34d 45%, #e8a200 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  WebkitTextStroke: '1px rgba(120,60,0,0.55)',
  filter: 'drop-shadow(0 2px 0 #9a5b00) drop-shadow(0 4px 0 #7a4400) drop-shadow(0 8px 6px rgba(0,0,0,0.45))',
};

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
  const idx = ORDER.indexOf(d.packageName.trim());
  const col = idx >= 0 ? COLORS[idx] : null;
  const label = idx >= 0 ? LABELS[idx] : (prizeText(d) ?? 'Grand prize').toUpperCase();
  const pageStyle = col
    ? { background: `linear-gradient(180deg, ${col[0]}, ${col[1]})` }
    : themeGradient(d.theme);
  const btnStyle: React.CSSProperties | undefined = col
    ? {
        background: `linear-gradient(180deg, ${col[0]}, ${col[2]})`,
        boxShadow: `0 5px 0 ${col[3]}, 0 10px 14px rgba(0,0,0,0.3), inset 0 2px 0 rgba(255,255,255,0.35)`,
      }
    : undefined;
  // Card: deep gradient + thick gold border + inner glow + outer depth
  const cardStyle: React.CSSProperties = {
    background: col
      ? `radial-gradient(circle at 50% 0%, ${col[0]} 0%, ${col[1]} 75%)`
      : 'rgba(0,0,0,0.25)',
    border: '5px solid #f5c542',
    boxShadow:
      '0 0 0 2px #8a5a00, 0 10px 0 #6b4300, 0 18px 24px rgba(0,0,0,0.45), inset 0 0 28px rgba(255,220,120,0.35), inset 0 3px 0 rgba(255,255,255,0.35)',
  };
  const whiteCard: React.CSSProperties = {
    boxShadow: '0 6px 0 rgba(0,0,0,0.18), 0 12px 16px rgba(0,0,0,0.25), inset 0 2px 0 #fff',
  };

  const goNext = async () => {
    try { nav(`/draw/${(await api<Draw>(`/packages/${d.packageId}/current-draw`)).id}`, { replace: true }); }
    catch (e) { toast(e instanceof Error ? e.message : 'No open draw yet', 'error'); }
  };

  return (
    <div className="min-h-screen" style={pageStyle}>
      <PageHeader title={`${d.packageName} Draw`} back="/" keep style={{ background: 'transparent' }} />
      {party && <Celebration ticketNo={d.winningTicketNo!} prize={d.prizeAmount} onClose={() => setParty(false)} />}

      <div className="mx-auto max-w-md space-y-6 px-4 pb-10 pt-8">
        {/* 3D prize card */}
        <div className="relative rounded-card p-4 pb-5 pt-8 text-center text-white" style={cardStyle}>
          <div className="absolute -top-8 left-1/2 -ml-7 text-6xl" style={{ filter: 'drop-shadow(0 4px 3px rgba(0,0,0,0.5))' }} aria-hidden>👑</div>
          <div className="text-6xl font-extrabold leading-tight" style={bigText}>{d.packageName}</div>
          <div
            className="mt-2 inline-block rounded-btn px-5 py-1 text-lg font-extrabold tracking-wide"
            style={{
              background: 'linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.45))',
              border: '2px solid #f5c542',
              boxShadow: '0 3px 0 #7a4400, inset 0 1px 0 rgba(255,255,255,0.3)',
              color: '#fff3b0',
              textShadow: '0 2px 2px rgba(0,0,0,0.5)',
            }}
          >
            {label}
          </div>
          <div className="mt-2 text-sm text-white/90">Prize: {d.prizeType === 'fixed' ? <Coins n={d.prizeValue} size={14} /> : <>{d.prizeValue}% of pool (<Coins n={d.prizeAmount} size={14} />)</>}</div>
          <div className="mt-2"><ModeBadge mode={d.mode} /></div>
          <div className="mt-3 text-xs text-white/80">Draw Date &amp; Time</div>
          <div className="text-lg font-semibold" style={{ textShadow: '0 2px 2px rgba(0,0,0,0.4)' }}>{fmtDateTime(d.drawTime)}</div>
          {open && (
            <div className="mt-1 text-xs text-white/85">
              ⏱ <Countdown target={d.drawTime} serverTime={d.serverTime} /> · {d.soldCount}/{d.maxTickets} sold
            </div>
          )}
        </div>

        {d.status === 'completed' && (
          <div className="rounded-card bg-white p-4 text-center" style={whiteCard}>
            <div className="text-xs font-semibold uppercase text-muted">Winning ticket</div>
            <div className="text-4xl font-extrabold tracking-widest text-bad">#{ticketLabel(d.winningTicketNo!)}</div>
            <div className="text-sm text-muted">Winner {d.winnerName} · <Coins n={d.prizeAmount} /></div>
            {d.iWon && <div className="mt-2 rounded-btn bg-gold-light py-2 font-bold text-[#6b4a00]">🎉 That is your ticket! Prize credited.</div>}
            <Link to={`/verify/${d.id}`} className="mt-2 inline-block text-sm font-semibold text-brand underline">Verify this result</Link>
          </div>
        )}
        {d.status === 'cancelled' && (
          <div className="rounded-card bg-white p-4 text-center text-sm" style={whiteCard}>
            Draw cancelled (not enough tickets sold). Tickets were refunded.
          </div>
        )}

        {/* Ticket price + Book Now */}
                <div className="rounded-card bg-white p-4" style={whiteCard}>
          <div className="text-center text-sm font-semibold" style={{ color: col ? col[1] : undefined }}>Ticket Price</div>
          <div className="mb-3 text-center text-3xl font-extrabold" style={{ color: col ? col[1] : undefined }}>
            <Coins n={d.ticketPrice} size={26} />
          </div>
          {open && d.myTicketNos.length > 0 && (
            <div className="mb-3 rounded-btn bg-brand-light py-3 text-center text-sm font-bold text-brand-dark">
              Your tickets: {d.myTicketNos.map((n) => `#${ticketLabel(n)}`).join(', ')}
            </div>
          )}
          {open && (btnStyle
            ? <button onClick={() => nav(`/book/${d.id}`)} style={btnStyle} className="w-full rounded-btn py-3 text-lg font-bold text-white active:translate-y-1">{d.myTicketNos.length ? 'Book Another' : 'Book Now'}</button>
            : <Button onClick={() => nav(`/book/${d.id}`)}>{d.myTicketNos.length ? 'Book Another' : 'Book Now'}</Button>)}
          {!open && <Button onClick={goNext}>Go to next draw</Button>}
        </div>

        {/* Prize Details / Past Results / How to Play */}
        <div className="grid grid-cols-3 gap-2 rounded-card bg-white p-2 text-center text-[11px] font-medium" style={whiteCard}>
          <button onClick={() => setPanel(panel === 'prize' ? null : 'prize')} className="rounded-btn py-2"><div className="text-xl">🏅</div>Prize Details</button>
          <Link to={`/results?packageId=${d.packageId}`} className="block rounded-btn py-2"><div className="text-xl">📋</div>Past Results</Link>
          <button onClick={() => setPanel(panel === 'how' ? null : 'how')} className="rounded-btn py-2"><div className="text-xl">❓</div>How to Play</button>
        </div>

        {panel === 'prize' && (
          <div className="space-y-1 rounded-card bg-white p-4 text-sm" style={whiteCard}>
            <p><b>Prize:</b> {d.prizeType === 'fixed' ? <Coins n={d.prizeValue} /> : `${d.prizeValue}% of the ticket pool (now `}{d.prizeType !== 'fixed' && <><Coins n={d.prizeAmount} />)</>}</p>
            <p><b>Tickets:</b> max {d.maxTickets}. The draw runs even if only one ticket is sold; with no tickets it is skipped.</p>
            <p><b>Winner selection:</b> {d.mode === 'random' ? 'Random (HMAC of a pre-committed server seed).' : 'Chosen by the admin before draw time.'}</p>
            <div className="pt-2 text-[11px] text-muted">
              <div className="font-semibold">Provably fair commitment (SHA-256 of server seed)</div>
              <button className="mt-1 block w-full break-all text-left font-mono" onClick={() => { navigator.clipboard?.writeText(d.serverSeedHash); toast('Hash copied', 'success'); }}>
                {d.serverSeedHash}
              </button>
              {d.serverSeed && <div className="mt-1 break-all"><span className="font-semibold">Revealed seed:</span> <span className="font-mono">{d.serverSeed}</span></div>}
            </div>
          </div>
        )}
        {panel === 'how' && (
          <ol className="list-decimal space-y-1 rounded-card bg-white p-4 pl-8 text-sm" style={whiteCard}>{HOW.map((h) => <li key={h}>{h}</li>)}</ol>
        )}
      </div>
    </div>
  );
}