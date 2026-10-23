import { ReactNode } from 'react';
import { HTMLMotionProps, motion } from 'framer-motion';
import { item } from './motion';
import { useNavigate } from 'react-router-dom';
import { MenuButton } from './sidebarContext';
import { headerGradient } from '../theme';
import type { DrawMode } from '../lib/types';
import { fmtCountdown, fmtNum, useCountdown } from '../lib/time';

export function Coin({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="coins" className="inline-block shrink-0 align-[-0.15em]">
      <circle cx="12" cy="12" r="11" fill="#c98a0b" />
      <circle cx="12" cy="12" r="9" fill="#f7c948" />
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="#c98a0b" strokeWidth="1.4" />
      <path d="M12 8v8M9.7 10.2c0-1 1-1.6 2.3-1.6s2.3.6 2.3 1.6-1 1.4-2.3 1.7-2.3.7-2.3 1.7 1 1.6 2.3 1.6 2.3-.6 2.3-1.6" fill="none" stroke="#8a5a05" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

export function Coins({ n, size = 16, className = '' }: { n: number; size?: number; className?: string }) {
  return <span className={`inline-flex items-center gap-1 font-semibold ${className}`}><Coin size={size} />{fmtNum(n)}</span>;
}

export function ModeBadge({ mode, className = '' }: { mode: DrawMode; className?: string }) {
  const random = mode === 'random';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-[11px] font-semibold ${className} ${
        random ? 'bg-white/90 text-brand-dark' : 'bg-gold text-[#5a3a00]'
      }`}
    >
      <span aria-hidden>{random ? '🎲' : '🛡️'}</span>
      {random ? 'Random draw' : 'Admin-selected winner'}
    </span>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-muted" role="status">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand/20 border-t-brand" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: [0, -6, 6, -4, 4, 0] }} transition={{ duration: 0.4 }}
      className="m-4 rounded-card border border-bad/30 bg-red-50 p-4 text-center text-sm text-bad">
      {error instanceof Error ? error.message : 'Something went wrong'}
      {retry && <button onClick={retry} className="mt-2 block w-full font-semibold underline">Try again</button>}
    </motion.div>
  );
}

export function Button({ variant = 'primary', className = '', ...p }: HTMLMotionProps<'button'> & { variant?: 'primary' | 'gold' | 'ghost' | 'white' | 'outline' }) {
  const v = {
    primary: 'bg-gradient-to-b from-[#ff3b30] to-[#c8102e] text-white shadow-card',
    gold: 'bg-gradient-to-b from-gold to-gold-dark text-[#4a2e00] shadow-card',
    white: 'bg-white text-brand-dark shadow-card',
    ghost: 'border border-brand/30 bg-white text-brand',
    outline: 'border-2 border-bad bg-white text-bad',
  }[variant];
  return (
    <motion.button
      whileHover={p.disabled ? undefined : { scale: 1.02 }}
      whileTap={p.disabled ? undefined : { scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      {...p}
      className={`w-full rounded-btn px-4 py-3 text-base font-bold disabled:opacity-50 ${v} ${className}`}
    />
  );
}

/** Sticky coloured bar on phones; on tablet/desktop a plain page title (or `keep` the look, e.g. over a themed page). */
export function PageHeader({ title, back = true, right, style, keep = false }: { title: string; back?: boolean | string; right?: ReactNode; style?: React.CSSProperties; keep?: boolean }) {
  const nav = useNavigate();
  return (
    <motion.header initial={{ y: -24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      className={`sticky top-0 z-20 flex items-center gap-3 px-4 py-3 text-white md:static md:mx-auto md:max-w-5xl md:px-6 ${keep ? 'md:pt-6' : 'md:pb-2 md:pt-8 md:text-ink md:![background:none]'}`} style={style ?? headerGradient}>
      <MenuButton className="-ml-1" />
      {back && (
        <motion.button whileTap={{ scale: 0.8, x: -3 }} aria-label="Back" onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))} className="px-1 text-2xl leading-none">‹</motion.button>
      )}
      <h1 className="flex-1 truncate text-lg font-semibold md:text-2xl md:font-bold">{title}</h1>
      {right}
    </motion.header>
  );
}

export function Countdown({ target, serverTime, className = '', done = 'Drawing…' }: { target?: string; serverTime?: string; className?: string; done?: string }) {
  const ms = useCountdown(target, serverTime);
  return <span className={`tabular-nums ${className}`}>{ms > 0 ? fmtCountdown(ms) : done}</span>;
}

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <motion.div variants={item} className={`rounded-card bg-white p-4 shadow-card ${className}`}>{children}</motion.div>
);

export const Empty = ({ children }: { children: ReactNode }) => (
  <motion.p variants={item} className="py-10 text-center text-sm text-muted">{children}</motion.p>
);
