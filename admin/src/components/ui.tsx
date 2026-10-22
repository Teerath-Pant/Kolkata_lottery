import { ReactNode } from 'react';
import { HTMLMotionProps, motion } from 'framer-motion';
import type { DrawMode } from '../lib/types';
import { fmtNum } from '../lib/time';

export const field = 'w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:shadow-glow';

export function Coin({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="coins" className="inline-block shrink-0 align-[-0.15em]">
      <circle cx="12" cy="12" r="11" fill="#c98a0b" />
      <circle cx="12" cy="12" r="9" fill="#f7c948" />
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="#c98a0b" strokeWidth="1.4" />
    </svg>
  );
}

export const Coins = ({ n, size = 14, className = '' }: { n: number; size?: number; className?: string }) => (
  <span className={`inline-flex items-center gap-1 font-semibold ${className}`}><Coin size={size} />{fmtNum(n)}</span>
);

export function ModeBadge({ mode }: { mode: DrawMode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-[11px] font-semibold ${mode === 'random' ? 'bg-brand-light text-brand-dark' : 'bg-gold text-[#5a3a00]'}`}>
      {mode === 'random' ? '🎲 Random draw' : '🛡️ Admin-selected winner'}
    </span>
  );
}

export const Spinner = () => (
  <div className="flex justify-center py-16" role="status"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand/20 border-t-brand" /></div>
);

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: [0, -6, 6, -4, 4, 0] }} transition={{ duration: 0.4 }} className="rounded-card border border-bad/30 bg-red-50 p-4 text-center text-sm text-bad">
      {error instanceof Error ? error.message : 'Something went wrong'}
      {retry && <button onClick={retry} className="mt-2 block w-full font-semibold underline">Try again</button>}
    </motion.div>
  );
}

export function Button({ variant = 'primary', className = '', ...p }: HTMLMotionProps<'button'> & { variant?: 'primary' | 'gold' | 'ghost' }) {
  const v = {
    primary: 'bg-gradient-to-b from-brand to-brand-dark text-white shadow-card',
    gold: 'bg-gradient-to-b from-gold to-gold-dark text-[#4a2e00] shadow-card',
    ghost: 'border border-brand/30 bg-white text-brand',
  }[variant];
  return (
    <motion.button
      whileHover={p.disabled ? undefined : { scale: 1.02 }} whileTap={p.disabled ? undefined : { scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      {...p} className={`w-full rounded-btn px-4 py-2.5 text-sm font-bold disabled:opacity-50 ${v} ${className}`}
    />
  );
}

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <motion.div whileHover={{ y: -2 }} className={`rounded-card bg-white p-4 shadow-card ${className}`}>{children}</motion.div>
);

export const Empty = ({ children }: { children: ReactNode }) => <p className="py-10 text-center text-sm text-muted">{children}</p>;

export function Load<T>({ q, children }: { q: { isLoading: boolean; error: unknown; data?: T; refetch: () => unknown }; children: (d: T) => ReactNode }) {
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorBox error={q.error} retry={() => q.refetch()} />;
  return <>{children(q.data)}</>;
}
