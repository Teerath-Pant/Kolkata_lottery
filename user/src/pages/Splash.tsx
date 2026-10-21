import { motion } from 'framer-motion';
import { Frame } from '../components/Layout';
import { Logo } from '../components/Logo';
import { APP_NAME, COIN_NOTE, TAGLINE } from '../config';
import { headerGradient } from '../theme';

export function Splash() {
  return (
    <Frame>
      <div className="flex min-h-screen flex-col items-center justify-center px-8 text-white" style={headerGradient}>
        {/* generic logo slot: replace components/Logo.tsx with your own artwork */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0, rotate: -10 }} animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 160, damping: 12 }}
        >
          <Logo size={170} className="drop-shadow-[0_10px_24px_rgba(0,0,0,0.45)]" />
        </motion.div>
        <h1 className="mt-6 text-center text-3xl font-extrabold text-gold">{APP_NAME}</h1>
        <p className="font-script text-3xl font-bold text-white">{TAGLINE}</p>
        <p className="mt-1 text-sm text-white/70">{COIN_NOTE}</p>
        <div className="mt-10 h-2.5 w-52 overflow-hidden rounded-pill bg-white/20">
          <motion.div className="h-full bg-gold" initial={{ width: '5%' }} animate={{ width: '100%' }} transition={{ duration: 1.4 }} />
        </div>
        <p className="mt-2 text-xs text-white/70">Loading…</p>
      </div>
    </Frame>
  );
}
