import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Logo } from './Logo';
import { useSidebar } from './sidebarContext';
import { Coins } from './ui';
import { COIN_NOTE } from '../config';
import { useAuth } from '../lib/auth';
import { MENU_ITEMS } from '../lib/menu';
import { headerGradient } from '../theme';

const MLink = motion.create(Link);

/** Left drawer that slides in over the page. Swipe left, tap the backdrop, or press Esc to close. */
export function Sidebar() {
  const { open, setOpen } = useSidebar();
  const { user, balance, logout } = useAuth();
  const close = () => setOpen(false);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <motion.div
            key="backdrop" aria-hidden onClick={close}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="absolute inset-0 bg-black/50"
          />
          <motion.aside
            key="panel" role="dialog" aria-modal="true" aria-label="Menu"
            initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
            transition={{ type: 'tween', duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
            drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: 0.2, right: 0 }} dragMomentum={false}
            style={{ willChange: 'transform' }}
            onDragEnd={(_, info) => (info.offset.x < -80 || info.velocity.x < -400) && close()}
            className="absolute inset-y-0 left-0 flex w-[78%] max-w-xs flex-col bg-white shadow-2xl"
          >
            <div className="px-4 pb-4 pt-5 text-white" style={headerGradient}>
              <div className="flex items-start justify-between">
                <Logo size={56} />
                <motion.button type="button" aria-label="Close menu" onClick={close} whileTap={{ scale: 0.8 }} className="px-1 text-2xl leading-none">✕</motion.button>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold text-lg font-bold text-brand-dark">
                  {user?.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{user?.name}</div>
                  <div className="text-xs text-white/80">{user?.username}</div>
                </div>
              </div>
              <div className="mt-3 inline-flex rounded-pill bg-white/15 px-3 py-1 text-sm"><Coins n={balance} /></div>
            </div>

            <nav className="flex-1 overflow-y-auto py-2">
              {MENU_ITEMS.map((i, idx) => (
                <motion.div key={i.to} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.12 + idx * 0.04, duration: 0.25, ease: 'easeOut' }}>
                  <MLink to={i.to} whileTap={{ backgroundColor: '#f2f5fb' }} className="flex items-center gap-3 px-4 py-3">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-full text-lg ${i.bg}`}>{i.icon}</span>
                    <span className="flex-1 text-sm font-medium">{i.label}</span>
                    <span className="text-lg text-muted">›</span>
                  </MLink>
                </motion.div>
              ))}
              <motion.button
                whileTap={{ backgroundColor: '#fff1f1' }} onClick={logout}
                className="flex w-full items-center gap-3 px-4 py-3 text-bad"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100 text-lg">🚪</span>
                <span className="flex-1 text-left text-sm font-semibold">Logout</span>
              </motion.button>
            </nav>

            <div className="px-4 py-3 text-center text-[11px] text-muted">{COIN_NOTE}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
