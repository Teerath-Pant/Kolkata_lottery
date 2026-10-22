import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { item } from './motion';
import { Coins, Countdown, ModeBadge } from './ui';
import { themeGradient } from '../theme';
import type { Pkg } from '../lib/types';

export const prizeText = (p: { prizeType: string; prizeValue: number }) =>
  p.prizeType === 'fixed' ? null : `${p.prizeValue}% of pool`;

const MLink = motion.create(Link);

/** Compact tile used on Home (2-col grid). */
export function PackageTile({ pkg }: { pkg: Pkg }) {
  const d = pkg.currentDraw;
  return (
    <MLink to={d ? `/draw/${d.id}` : '#'} variants={item} whileHover={{ y: -4, scale: 1.02 }} whileTap={{ scale: 0.96 }}
      className="relative block overflow-hidden rounded-card p-3 text-white shadow-card md:p-5" style={themeGradient(pkg.theme)}>
      <motion.div animate={{ rotate: [0, -8, 8, 0] }} transition={{ repeat: Infinity, duration: 3.5, repeatDelay: 2 }} className="w-fit text-2xl" aria-hidden>🏆</motion.div>
      <div className="text-[11px] font-medium text-white/80">{pkg.name}</div>
      <div className="text-lg font-extrabold leading-tight min-[380px]:text-xl md:text-2xl"><Coins n={d?.prizeAmount ?? 0} size={18} className="font-extrabold" /></div>
      <div className="text-[10px] uppercase tracking-wide text-gold">{prizeText(pkg) ?? 'Grand prize'}</div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="rounded-pill bg-black/25 px-2 py-0.5"><Coins n={pkg.price} size={12} className="text-[11px]" /> / ticket</span>
      </div>
      <div className="mt-1.5 text-[11px] text-white/90">⏱ {d ? <Countdown target={d.drawTime} serverTime={d.serverTime} /> : '—'}</div>
      {d && <ModeBadge mode={d.mode} className="mt-1.5 !text-[9px]" />}
    </MLink>
  );
}

const ROW_COLORS = [
  'from-red-500 to-red-700',
  'from-blue-500 to-blue-700',
  'from-green-500 to-green-700',
  'from-purple-500 to-purple-700',
  'from-pink-500 to-fuchsia-700',
];
const ROW_LABELS = ['1st Prize (Grand)', '2nd Prize (Mega)', '3rd Prize (Special)', '4th Prize (Special)', '5th Prize (Super)'];

/** Wide row used on Package Select. */
export function PackageRow({ pkg, index = 0 }: { pkg: Pkg; index?: number }) {
  const d = pkg.currentDraw;
  const known = index < ROW_COLORS.length;
  return (
    <motion.div
      variants={item}
      whileTap={{ scale: 0.98 }}
      className={`flex items-center gap-3 rounded-card bg-gradient-to-br ${known ? ROW_COLORS[index] : ROW_COLORS[0]} p-3 text-white shadow-card min-[380px]:p-4`}
    >
      <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 2.4 }} className="text-4xl" aria-hidden>🏆</motion.div>
      <Link to={d ? `/draw/${d.id}` : '#'} className="min-w-0 flex-1">
        <div className="text-3xl font-extrabold leading-tight">{pkg.name}</div>
        <div className="text-xs text-white/90">{known ? ROW_LABELS[index] : (prizeText(pkg) ?? 'Prize')}</div>
        <div className="text-xs text-white/85">
          Ticket <Coins n={pkg.price} size={12} /> · {d ? <>Draw in <Countdown target={d.drawTime} serverTime={d.serverTime} /></> : 'No open draw'}
        </div>
      </Link>
      {d && (
        <MLink to={`/book/${d.id}`} whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.05 }} className="shrink-0 rounded-btn bg-white/95 px-3 py-2 text-center text-xs font-bold text-ink shadow-card">
          {d.myTicketNo ? <>Aur<br />Ticket</> : <>Book<br />Now</>}
        </MLink>
      )}
    </motion.div>
  );
}