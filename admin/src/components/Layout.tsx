import { NavLink, Navigate, useLocation, useOutlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Page } from './motion';
import { APP_NAME } from '../config';
import { useAuth } from '../lib/auth';
import { headerGradient } from '../theme';
import { Spinner } from './ui';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/draws', label: 'Draws' },
  { to: '/packages', label: 'Packages' },
  { to: '/users', label: 'Users' },
  { to: '/audit', label: 'Audit log' },
];

export function Layout() {
  const { admin, loading, logout } = useAuth();
  const loc = useLocation();
  const outlet = useOutlet();
  if (loading) return <Spinner />;
  if (!admin) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return (
    <div className="min-h-[100dvh]">
      <motion.header initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 28 }} className="sticky top-0 z-20 text-white" style={headerGradient}>
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-gold bg-gradient-to-b from-[#ff3b30] to-[#8a0c0c] text-lg" aria-label="logo">🎟️</div>
          <div className="flex-1">
            <div className="text-sm font-bold text-gold">{APP_NAME}</div>
            <div className="text-[11px] text-white/70">Admin Panel</div>
          </div>
          <span className="hidden text-xs text-white/80 sm:block">{admin.name} · +{admin.mobile}</span>
          <motion.button whileTap={{ scale: 0.92 }} onClick={logout} className="rounded-pill bg-white/15 px-3 py-1.5 text-xs font-semibold">Logout</motion.button>
        </div>
        <nav className="no-scrollbar mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 sm:px-4">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="relative shrink-0">
              {({ isActive }) => (
                <span className={`relative block px-3 py-2 text-sm font-semibold sm:px-4 ${isActive ? 'text-brand-dark' : 'text-white/80'}`}>
                  {isActive && <motion.span layoutId="admin-nav" className="absolute inset-0 rounded-t-btn bg-page" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
                  <span className="relative">{n.label}</span>
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </motion.header>
      <main className="mx-auto max-w-6xl p-3 sm:p-4"><Page key={loc.pathname}>{outlet}</Page></main>
      <footer className="px-4 py-4 text-center text-[11px] text-muted">{APP_NAME} admin · Play coins only, no real value</footer>
    </div>
  );
}
