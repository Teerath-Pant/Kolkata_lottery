import type { CSSProperties } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { fmtNum, ticketLabel } from '../lib/time';

type Props = {
  ticketNo?: number | string;
  drawTime?: string | Date;
  userName?: string;
  ticketPrice?: number;
  /** live winning prize, drawn in the empty prize area of the ticket image */
  prize?: number;
  qrValue?: string;
  drawNo?: number | string;
  className?: string;
};

const ordinal = (n: number) => {
  const suffix = n % 100;
  const ending = suffix >= 11 && suffix <= 13 ? 'TH' : ({ 1: 'ST', 2: 'ND', 3: 'RD' } as Record<number, string>)[n % 10] ?? 'TH';
  return `${n}${ending}`;
};

const pos = (x: number, y: number): CSSProperties => ({
  position: 'absolute',
  left: `${x}%`,
  top: `${y}%`,
  transform: 'translate(-50%, -50%)',
});

const numFont: CSSProperties = {
  fontFamily: '"Times New Roman", Georgia, serif',
  fontWeight: 700,
  color: '#111',
  letterSpacing: '0.02em',
  lineHeight: 1,
  whiteSpace: 'nowrap',
};

const pinkFont: CSSProperties = {
  fontFamily: 'Impact, "Arial Narrow", "Arial Black", sans-serif',
  color: '#9b1c5c',
  letterSpacing: '0.01em',
  lineHeight: 1,
  whiteSpace: 'nowrap',
};

const STAR = Array.from({ length: 48 }, (_, i) => {
  const radius = i % 2 ? 84 : 97;
  const angle = (Math.PI * 2 * i) / 48;
  return `${(Math.cos(angle) * radius).toFixed(1)},${(Math.sin(angle) * radius).toFixed(1)}`;
}).join(' ');

// Shrinks the font so "Rs + amount" never exceeds maxW (cqw), however many digits the price has.
// lead: "Rs" in front of the amount (default) or nothing.
const LEAD_EM = { Rs: 1.56, none: 0 }; // "Rs " in Arial bold
function CoinPrice({ price, size, maxW, lead = 'Rs' }: { price: number; size: number; maxW: number; lead?: keyof typeof LEAD_EM }) {
  const textEm = [...fmtNum(price)].reduce((w, c) => w + (/\d/.test(c) ? 0.556 : 0.278), 0);
  const fontSize = Math.min(size, maxW / (LEAD_EM[lead] + textEm));
  return (
    <span style={{ fontSize: `${fontSize}cqw`, lineHeight: 1, whiteSpace: 'nowrap' }}>
      {lead === 'Rs' && 'Rs '}{fmtNum(price)}
    </span>
  );
}

function PriceBadge({ x, y, w, h, price }: { x: number; y: number; w: number; h: number; price: number }) {
  return (
    <div
      style={{
        ...pos(x, y), width: `${w}cqw`, height: `${h}cqw`, borderRadius: '1.1cqw',
        background: 'linear-gradient(180deg,#e0402f 0%,#b4211a 100%)',
        boxShadow: '0 0 0.9cqw rgba(255,130,130,0.55), inset 0 0 0.3cqw rgba(255,255,255,0.35)',
        border: '0.25cqw solid rgba(255,190,190,0.7)', boxSizing: 'border-box', color: '#fff',
        textAlign: 'center', fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: 800,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <CoinPrice price={price} size={3.3} maxW={w - 1.2} lead="Rs" />
      <div style={{ fontSize: '1.8cqw', marginTop: '0.5cqw', letterSpacing: '0.05em', lineHeight: 1 }}>ONLY</div>
    </div>
  );
}

export function TicketCard({ ticketNo, drawTime, userName, ticketPrice, prize, qrValue, drawNo, className }: Props) {
  const dateValue = drawTime === undefined ? null : drawTime instanceof Date ? drawTime : new Date(drawTime);
  const validDate = dateValue && Number.isFinite(dateValue.getTime()) ? dateValue : null;
  const date = validDate
    ? `${String(validDate.getDate()).padStart(2, '0')}-${String(validDate.getMonth() + 1).padStart(2, '0')}-${validDate.getFullYear()}`
    : undefined;
  const hours = validDate ? validDate.getHours() : undefined;
  const time = validDate ? `${hours! % 12 || 12}:${String(validDate.getMinutes()).padStart(2, '0')}` : undefined;
  const ampm = hours === undefined ? undefined : hours >= 12 ? 'PM' : 'AM';
  const weekday = validDate?.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const rawTicketNo = ticketNo === undefined ? '' : String(ticketNo);
  const parsedTicketNo = /^\d+$/.test(rawTicketNo) ? Number(rawTicketNo) : NaN;
  const no = Number.isSafeInteger(parsedTicketNo) && parsedTicketNo >= 0 ? ticketLabel(parsedTicketNo) : undefined;
  const name = userName?.trim().toUpperCase() ?? '';
  const nameSize = name ? Math.min(3.05, 45 / name.length) : 0;
  const validDrawNo = drawNo === undefined || drawNo === null || String(drawNo).trim() === '' ? undefined : Number(drawNo);
  const validPrize = prize !== undefined && Number.isFinite(prize) ? prize : undefined;
  const validPrice = ticketPrice !== undefined && Number.isFinite(ticketPrice) ? ticketPrice : undefined;
  const qr = qrValue?.trim() || undefined;

  return (
    <div
      className={className}
      style={{
        position: 'relative', width: '100%', aspectRatio: '1647 / 955', containerType: 'inline-size',
        backgroundImage: 'url(/ticket2-v2.png)', backgroundSize: '100% 100%', borderRadius: '1.2cqw', overflow: 'hidden',
      }}
    >
      {time && ampm && (
        <div style={{ ...pos(56.4, 13.3), ...numFont, fontSize: '4.4cqw' }}>
          {time}<span style={{ fontSize: '1.2cqw', marginLeft: '0.4cqw' }}>{ampm}</span>
        </div>
      )}
      {no && <div style={{ ...pos(77.6, 13.3), ...numFont, fontSize: '6.2cqw' }}>{no}</div>}

      {validPrize !== undefined && (
        <div style={{
          ...pos(33, 58.9), width: '50cqw', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5cqw',
          color: '#d3160c', fontFamily: pinkFont.fontFamily, fontWeight: 800, lineHeight: 1,
        }}>
          <div style={{ fontSize: '1.8cqw', letterSpacing: '0.12em', color: '#9b1c5c' }}>WINNING PRIZE</div>
          <CoinPrice price={validPrize} size={6.5} maxW={46} lead="none" />
        </div>
      )}

      {name && (
        <div style={{
          ...pos(33.8, 46.4), width: '47cqw', overflow: 'hidden', textOverflow: 'clip', whiteSpace: 'nowrap',
          textAlign: 'center', fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: 800, color: '#fff',
          letterSpacing: '0.04em', fontSize: `${nameSize}cqw`, lineHeight: 1,
        }}>
          {name}
        </div>
      )}

      {validDrawNo !== undefined && Number.isSafeInteger(validDrawNo) && validDrawNo >= 0 && (
        <div style={{ ...pos(78.3, 26), ...pinkFont, fontSize: '2.8cqw' }}>{ordinal(validDrawNo)} DRAW ON</div>
      )}
      {date && <div style={{ ...pos(78.3, 34), ...pinkFont, fontSize: '4.6cqw' }}>{date}</div>}
      {time && ampm && <div style={{ ...pos(78.3, 41.5), ...pinkFont, fontSize: '2.7cqw' }}>{time} {ampm[0]}.M. ONWARDS</div>}
      {weekday && <div style={{ ...pos(78.3, 46.6), ...pinkFont, fontSize: '2.7cqw' }}>{weekday}</div>}

      {validPrice !== undefined && <>
        <PriceBadge x={44.4} y={12.4} w={7.7} h={9.1} price={validPrice} />
        <PriceBadge x={8.2} y={85.3} w={6.9} h={9.0} price={validPrice} />
        <div style={{ ...pos(9.6, 61), display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#8f2144', fontFamily: pinkFont.fontFamily, fontWeight: 800, lineHeight: 1 }}>
          <CoinPrice price={validPrice} size={3.6} maxW={8} lead="Rs" />
          <div style={{ fontSize: '2.1cqw', marginTop: '0.5cqw', letterSpacing: '0.05em' }}>ONLY</div>
        </div>
        <div style={{ ...pos(81.8, 62.4), width: '13.4cqw', height: '13.4cqw' }}>
          <svg viewBox="-100 -100 200 200" style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden="true">
            <defs><radialGradient id="ticketBluePrice" cx="40%" cy="35%" r="75%"><stop offset="0%" stopColor="#2f6fe0" /><stop offset="100%" stopColor="#123f9c" /></radialGradient></defs>
            <polygon fill="url(#ticketBluePrice)" points={STAR} />
            <circle r="78" fill="none" stroke="#fff" strokeWidth="2.5" strokeDasharray="1 7" strokeLinecap="round" opacity="0.9" />
          </svg>
          <div style={{
            ...pos(50, 50), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4cqw',
            color: '#fff', fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: 800, lineHeight: 1,
          }}>
            <div style={{ fontSize: '2cqw' }}>ONLY</div>
            <CoinPrice price={validPrice} size={4.1} maxW={9} lead="Rs" />
          </div>
        </div>
      </>}

      {no && <div style={{ ...pos(30.9, 82), ...numFont, fontSize: '6.2cqw', paddingTop: '4cqw' }}>* {no} *</div>}

      {qr && (
        <div style={{ ...pos(65.4, 79.7), width: '14.3cqw', height: '15.5cqw', boxSizing: 'border-box' }}>
          <QRCodeSVG value={qr} bgColor="transparent" fgColor="#111" marginSize={1} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>
      )}
    </div>
  );
}
