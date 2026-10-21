import { useId } from 'react';
import { APP_NAME, LOGO_LINES } from '../config';

/**
 * Brand logo: ornate gold frame, red shield, a domed palace against an evening sky, and the app name in
 * gold lettering. Text comes from LOGO_LINES in config.ts. Replace this component to use your own artwork.
 */
export function Logo({ size = 120, className = '' }: { size?: number; className?: string }) {
  const u = useId().replace(/:/g, ''); // unique gradient ids if several logos render on one page
  const id = (n: string) => `${n}-${u}`;
  const ref = (n: string) => `url(#${id(n)})`;
  const [top, bottom] = LOGO_LINES;

  return (
    <svg width={size} height={size * 0.88} viewBox="0 0 200 176" role="img" aria-label={`${APP_NAME} logo`} className={className}>
      <defs>
        <linearGradient id={id('gold')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset="0.35" stopColor="#f7c948" />
          <stop offset="0.7" stopColor="#d99a12" />
          <stop offset="1" stopColor="#8f5a03" />
        </linearGradient>
        <linearGradient id={id('goldText')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffbe6" />
          <stop offset="0.45" stopColor="#ffd75e" />
          <stop offset="1" stopColor="#d18a06" />
        </linearGradient>
        <linearGradient id={id('red')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d81e1e" />
          <stop offset="0.6" stopColor="#a50f12" />
          <stop offset="1" stopColor="#6e0508" />
        </linearGradient>
        <linearGradient id={id('sky')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5aa9f0" />
          <stop offset="0.55" stopColor="#bfe0ff" />
          <stop offset="0.8" stopColor="#ffd9a0" />
          <stop offset="1" stopColor="#ff9f45" />
        </linearGradient>
        <linearGradient id={id('stone')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6dd" />
          <stop offset="1" stopColor="#f0c98a" />
        </linearGradient>
        <radialGradient id={id('glow')} cx="0.5" cy="0.35" r="0.6">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={id('window')}>
          <path d="M42 84 V66 C42 42 68 30 100 30 C132 30 158 42 158 66 V84 Z" />
        </clipPath>
      </defs>

      {/* side scroll flourishes */}
      <g fill={ref('gold')} stroke="#7a4a02" strokeWidth="1">
        <path d="M14 96 C2 92 0 108 10 112 C4 104 10 98 18 102 Z" />
        <path d="M186 96 C198 92 200 108 190 112 C196 104 190 98 182 102 Z" />
      </g>

      {/* outer gold frame + red shield */}
      <path d="M100 6 C152 6 188 28 188 64 V116 C188 144 152 160 100 168 C48 160 12 144 12 116 V64 C12 28 48 6 100 6 Z" fill={ref('gold')} stroke="#7a4a02" strokeWidth="1.5" />
      <path d="M100 13 C147 13 181 33 181 66 V114 C181 139 148 153 100 161 C52 153 19 139 19 114 V66 C19 33 53 13 100 13 Z" fill={ref('red')} />
      <path d="M100 13 C147 13 181 33 181 66 V114 C181 139 148 153 100 161 C52 153 19 139 19 114 V66 C19 33 53 13 100 13 Z" fill={ref('glow')} />
      {/* thin inner gold line */}
      <path d="M100 19 C143 19 175 37 175 67 V113 C175 135 144 148 100 155 C56 148 25 135 25 113 V67 C25 37 57 19 100 19 Z" fill="none" stroke="#f7c948" strokeWidth="1" opacity="0.7" />

      {/* sky window with palace */}
      <g clipPath={ref('window')}>
        <rect x="40" y="28" width="120" height="58" fill={ref('sky')} />
        <ellipse cx="62" cy="44" rx="14" ry="5" fill="#fff" opacity="0.7" />
        <ellipse cx="140" cy="40" rx="12" ry="4" fill="#fff" opacity="0.6" />
        {/* birds */}
        <path d="M52 52 q3 -3 6 0 q3 -3 6 0 M136 54 q2 -2 4 0 q2 -2 4 0" fill="none" stroke="#7a3b10" strokeWidth="1" />
        {/* palace */}
        <g fill={ref('stone')} stroke="#b9782a" strokeWidth="0.6">
          <rect x="54" y="66" width="92" height="14" />
          <rect x="84" y="56" width="32" height="10" />
          <path d="M82 57 C82 38 118 38 118 57 Z" />
          <rect x="98.8" y="34" width="2.4" height="7" />
          <circle cx="100" cy="33" r="2" fill="#f7c948" />
          {/* side towers */}
          <rect x="60" y="54" width="10" height="12" />
          <path d="M58.5 55 C58.5 47 71.5 47 71.5 55 Z" />
          <rect x="130" y="54" width="10" height="12" />
          <path d="M128.5 55 C128.5 47 141.5 47 141.5 55 Z" />
          <rect x="74" y="60" width="8" height="6" />
          <rect x="118" y="60" width="8" height="6" />
        </g>
        {/* arches */}
        <g fill="#b9782a" opacity="0.55">
          {[60, 70, 80, 92, 104, 116, 128, 136].map((x) => <path key={x} d={`M${x} 80 v-6 a2.5 2.5 0 0 1 5 0 v6 z`} />)}
        </g>
        {/* trees */}
        <path d="M40 86 V79 q6 -5 12 -1 q6 -4 12 0 q8 -3 14 1 h44 q6 -4 14 -1 q6 -4 12 0 q6 -4 12 1 V86 Z" fill="#2f7a3a" />
      </g>
      <path d="M42 84 V66 C42 42 68 30 100 30 C132 30 158 42 158 66 V84" fill="none" stroke={ref('gold')} strokeWidth="2.5" />

      {/* name in gold lettering */}
      <g fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" textAnchor="middle" style={{ paintOrder: 'stroke' }} stroke="#4a0303" strokeLinejoin="round">
        <text x="100" y="116" fontSize="36" fill={ref('goldText')} strokeWidth="4">{top}</text>
        {bottom && <text x="100" y="146" fontSize="27" fill={ref('goldText')} strokeWidth="3.5">{bottom}</text>}
      </g>

      {/* bottom ornament */}
      <g fill={ref('gold')} stroke="#7a4a02" strokeWidth="0.8">
        <path d="M100 160 l6 6 -6 8 -6 -8 z" />
        <path d="M86 162 c-8 2 -12 -4 -8 -8 c0 4 4 6 8 4 z M114 162 c8 2 12 -4 8 -8 c0 4 -4 6 -8 4 z" />
      </g>
      {/* sparkles */}
      <path d="M36 102 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5 z" fill="#fff4cc" />
      <path d="M164 130 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2 z" fill="#fff4cc" />
    </svg>
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
