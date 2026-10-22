import { Link, NavLink, Navigate, useLocation, useOutlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CountUp, Page } from './motion';
import { Logo } from './Logo';
import { APP_NAME, COIN_NOTE, TAGLINE } from '../config';
import { useAuth } from '../lib/auth';
import { headerGradient } from '../theme';
import { Coin, Spinner } from './ui';

const TABS = [
  { to: '/', label: 'Home', icon: '🏠', end: true },
  { to: '/tickets', label: 'Tickets', icon: '🎟️' },
  { to: '/results', label: 'Results', icon: '🏆' },
  { to: '/wallet', label: 'Wallet', icon: '👛' },
  { to: '/more', label: 'More', icon: '⋯' },
];

/** App shell: top nav on tablet/desktop, bottom tab bar on phones (`tabs`). Routes inside require login. */
export function Shell({ tabs = true }: { tabs?: boolean }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  const outlet = useOutlet();
  if (loading) return <Frame><Spinner /></Frame>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname + loc.search }} replace />;
  return (
       <Frame>
      <DesktopNav />
      <main className={`${tabs ? 'pb-28' : 'pb-8'} md:pb-12`}><Page key={loc.pathname}>{outlet}</Page></main>
      {tabs && <TabBar />}
    </Frame>
  );
}

export const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="relative min-h-[100dvh] w-full overflow-x-clip bg-page">{children}</div>
);

export function Footer({ className = '' }: { className?: string }) {
  return (
    <footer className={`px-4 py-3 text-center text-[11px] text-muted ${className}`}>
      {APP_NAME} · {COIN_NOTE}
    </footer>
  );
}

/** Tablet/desktop navigation (hidden on phones, which use the bottom TabBar). */
function DesktopNav() {
  const { user, balance } = useAuth();
  return (
    <motion.header
      initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      className="sticky top-0 z-30 hidden text-white shadow-card md:block" style={headerGradient}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-2 lg:gap-6">
        <Link to="/" className="flex shrink-0 items-center gap-3">
          <Logo size={56} />
          <div className="hidden leading-tight lg:block">
            <div className="font-bold text-gold">{APP_NAME}</div>
            <div className="font-script text-lg text-white/85">{TAGLINE}</div>
          </div>
        </Link>
        <nav className="flex flex-1 justify-center gap-1">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end}>
              {({ isActive }) => (
                <motion.span whileTap={{ scale: 0.94 }} className={`relative flex items-center gap-2 rounded-pill px-3 py-2 text-sm font-semibold transition-colors lg:px-4 ${isActive ? 'text-brand-dark' : 'text-white/85 hover:text-white'}`}>
                  {isActive && <motion.span layoutId="desk-tab" className="absolute inset-0 rounded-pill bg-white" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
                  <span className="relative">{t.icon}</span>
                  <span className="relative">{t.label}</span>
                </motion.span>
              )}
            </NavLink>
          ))}
        </nav>
        <Link to="/wallet" className="flex shrink-0 items-center gap-2 rounded-pill bg-white/15 px-4 py-2 text-sm font-semibold transition-colors hover:bg-white/25">
          <Coin size={18} /><CountUp value={balance} />
        </Link>
        <span className="hidden max-w-[10rem] truncate text-sm text-white/80 xl:block">Hi {user?.name}</span>
      </div>
    </motion.header>
  );
}

function TabBar() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 md:hidden">
    <motion.nav
      initial={{ y: 80 }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      className="pointer-events-auto flex rounded-t-card bg-white px-1 pb-[env(safe-area-inset-bottom)] shadow-bar"
    >
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className="relative flex-1">
          {({ isActive }) => (
            <motion.div whileTap={{ scale: 0.88 }} className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium min-[360px]:text-[11px] ${isActive ? 'text-bad' : 'text-muted'}`}>
              {isActive && <motion.span layoutId="tab-indicator" className="absolute inset-x-3 top-0 h-[3px] rounded-b-full bg-bad" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />}
              <motion.span animate={{ y: isActive ? -2 : 0, scale: isActive ? 1.15 : 1 }} className="text-xl leading-none">{t.icon}</motion.span>
              {t.label}
            </motion.div>
          )}
        </NavLink>
      ))}
    </motion.nav>
    </div>
  );
}
