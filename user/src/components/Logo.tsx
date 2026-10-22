import { useId } from 'react';
import { APP_NAME } from '../config';

/** Brand logo: image from user/public/logo.webp. size aur className props pehle jaise hi kaam karte hain. */
export function Logo({ size = 120, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src="/logo.webp"
      alt={`${APP_NAME} logo`}
      width={size}
      height={size}
      className={`object-contain ${className}`}
    />
  );
}

/** Decorative light-blue skyline (domed hall, boat, cantilever bridge, water) for the bottom of the auth screen. */
export function Skyline({ className = '', fade = true, slice = false }: { className?: string; fade?: boolean; slice?: boolean }) {
  const c = '#8fb0ea';
  const fadeId = `sky-fade-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 400 130" preserveAspectRatio={`xMidYMax ${slice ? 'slice' : 'meet'}`} aria-hidden className={className}>
      <defs>
        <linearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#dbe7ff" />
        </linearGradient>
      </defs>
      {fade && <rect x="0" y="0" width="400" height="130" fill={`url(#${fadeId})`} />}
      <g fill={c} opacity="0.55">
        {/* domed hall */}
        <path d="M30 92 h96 v-20 h-96 z" />
        <path d="M52 72 a26 22 0 0 1 52 0 z" />
        <rect x="76" y="40" width="4" height="12" />
        <circle cx="78" cy="38" r="3" />
        <path d="M30 72 a8 8 0 0 1 16 0 z M110 72 a8 8 0 0 1 16 0 z" />
        {[38, 50, 62, 74, 86, 98, 110].map((x) => <rect key={x} x={x} y="76" width="4" height="16" fill="#ffffff" opacity="0.7" />)}
        {/* trees */}
        <circle cx="16" cy="88" r="9" /><circle cx="140" cy="86" r="10" /><circle cx="156" cy="90" r="7" />
      </g>
      {/* bridge */}
      <g stroke={c} strokeWidth="2" fill="none" opacity="0.75">
        <path d="M168 92 H400" strokeWidth="3" />
        <path d="M232 92 V34 M330 92 V34" strokeWidth="4" />
        <path d="M168 92 Q200 70 232 36 Q281 76 330 36 Q362 70 400 88" />
        {[184, 200, 216, 248, 264, 281, 298, 314, 346, 362, 380].map((x) => (
          <path key={x} d={`M${x} 92 L${x < 232 ? x + 8 : x < 330 ? (x < 281 ? x - 8 : x + 8) : x - 8} ${x < 232 ? 92 - (x - 168) * 0.55 : x < 330 ? 60 + Math.abs(x - 281) * 0.45 : 92 - (400 - x) * 0.18}`} strokeWidth="1.2" />
        ))}
      </g>
      {/* boat */}
      <g fill={c} opacity="0.7">
        <path d="M120 106 h44 l-6 8 h-32 z" />
        <rect x="130" y="98" width="22" height="8" rx="1" />
        <rect x="138" y="92" width="3" height="6" />
      </g>
      {/* water */}
      <g stroke={c} strokeWidth="1.5" opacity="0.5" strokeLinecap="round">
        <path d="M10 116 h40 M70 122 h50 M180 112 h60 M260 120 h50 M330 112 h50 M200 126 h40" />
      </g>
    </svg>
  );
}