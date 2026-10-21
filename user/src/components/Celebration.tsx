import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Button, Coins } from './ui';
import { ticketLabel } from '../lib/time';

const COLORS = ['#f7c948', '#ff3b30', '#2f64e8', '#25a95c', '#ffffff', '#ff7ac8'];

/** Full-screen winner celebration: confetti + trophy card. */
export function Celebration({ ticketNo, prize, onClose }: { ticketNo: number; prize: number; onClose: () => void }) {
  const calm = (() => { try { return localStorage.getItem('ltd.calm') === '1'; } catch { return false; } })();
  const pieces = useMemo(() => Array.from({ length: calm ? 0 : 46 }, (_, i) => ({
    id: i, x: Math.random() * 100, delay: Math.random() * 0.8, dur: 2.2 + Math.random() * 1.8,
    rot: Math.random() * 720 - 360, color: COLORS[i % COLORS.length], size: 6 + Math.random() * 8,
  })), [calm]);
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-6" role="dialog" aria-label="You won">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {pieces.map((p) => (
          <motion.span
            key={p.id}
            className="absolute top-0 block rounded-sm"
            style={{ left: `${p.x}%`, width: p.size, height: p.size * 0.5, background: p.color }}
            initial={{ y: -20, rotate: 0, opacity: 1 }}
            animate={{ y: '105vh', rotate: p.rot, opacity: [1, 1, 0.8] }}
            transition={{ duration: p.dur, delay: p.delay, ease: 'easeIn', repeat: Infinity, repeatDelay: 0.4 }}
          />
        ))}
      </div>
      <motion.div
        initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 14 }}
        className="relative w-full max-w-[340px] rounded-card bg-gradient-to-b from-brand to-brand-dark p-6 text-center text-white shadow-card"
      >
        <motion.div animate={calm ? {} : { rotate: [-8, 8, -8], scale: [1, 1.12, 1] }} transition={{ repeat: Infinity, duration: 1.6 }} className="text-6xl">🏆</motion.div>
        <h2 className="mt-2 text-2xl font-extrabold text-gold">You won!</h2>
        <p className="mt-1 text-sm text-white/80">Ticket #{ticketLabel(ticketNo)} is the winner</p>
        <div className="my-4 rounded-btn bg-white/10 py-3 text-3xl"><Coins n={prize} size={28} className="font-extrabold" /></div>
        <Button variant="gold" onClick={onClose}>Awesome</Button>
      </motion.div>
    </div>
  );
}
