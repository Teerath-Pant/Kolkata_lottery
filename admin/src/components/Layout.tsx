import { useEffect, useState } from 'react';
import { NavLink, Navigate, useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
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
  { to: '/winners', label: 'Winners' },
];

const Burger = ({ open }: { open: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
    {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
  </svg>
);

export function Layout() {
  const { admin, loading, logout } = useAuth();
  const loc = useLocation();
  const outlet = useOutlet();
  const [menu, setMenu] = useState(false);

  useEffect(() => { setMenu(false); }, [loc.pathname]); // close the drawer after navigating
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

  if (loading) return <Spinner />;
  if (!admin) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-20 text-white" style={headerGradient}>
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4">
          <button type="button" aria-label="Open menu" aria-expanded={menu} onClick={() => setMenu(true)}
            className="-ml-1 rounded-btn p-2 hover:bg-white/10 md:hidden"><Burger open={false} /></button>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-gold bg-gradient-to-b from-[#ff3b30] to-[#8a0c0c] text-lg" aria-label="logo">🎟️</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-gold">{APP_NAME}</div>
            <div className="text-[11px] text-white/70">Admin Panel</div>
          </div>
          <span className="hidden text-xs text-white/80 lg:block">{admin.name} · {admin.username}</span>
          <motion.button whileTap={{ scale: 0.92 }} onClick={logout} className="hidden rounded-pill bg-white/15 px-3 py-1.5 text-xs font-semibold md:block">Logout</motion.button>
        </div>
        {/* tabs on tablet/desktop; on phones the hamburger drawer below replaces them */}
        <nav className="no-scrollbar mx-auto hidden max-w-6xl gap-1 overflow-x-auto px-2 sm:px-4 md:flex">
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
      </header>

      <AnimatePresence>
        {menu && (
          <>
            <motion.div key="overlay" className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setMenu(false)}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.aside key="drawer" role="dialog" aria-modal="true" aria-label="Menu"
              className="fixed inset-y-0 left-0 z-40 flex w-64 max-w-[80vw] flex-col text-white shadow-card md:hidden" style={headerGradient}
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', stiffness: 380, damping: 36 }}>
              <div className="flex items-center gap-2 px-3 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-gold bg-gradient-to-b from-[#ff3b30] to-[#8a0c0c] text-lg" aria-hidden>🎟️</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-gold">{APP_NAME}</div>
                  <div className="text-[11px] text-white/70">Admin Panel</div>
                </div>
                <button type="button" aria-label="Close menu" onClick={() => setMenu(false)} className="rounded-btn p-2 hover:bg-white/10"><Burger open /></button>
              </div>
              <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
                {NAV.map((n) => (
                  <NavLink key={n.to} to={n.to} end={n.end}
                    className={({ isActive }) => `block rounded-btn px-3 py-3 text-sm font-semibold ${isActive ? 'bg-page text-brand-dark' : 'text-white/90 hover:bg-white/10'}`}>
                    {n.label}
                  </NavLink>
                ))}
              </nav>
              <div className="border-t border-white/15 p-3">
                <div className="mb-2 truncate text-xs text-white/80">{admin.name} · {admin.username}</div>
                <button type="button" onClick={logout} className="w-full rounded-pill bg-white/15 py-2 text-sm font-semibold">Logout</button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="mx-auto max-w-6xl p-3 sm:p-4"><Page key={loc.pathname}>{outlet}</Page></main>
      <footer className="px-4 py-4 text-center text-[11px] text-muted">{APP_NAME} admin · Play coins only, no real value</footer>
    </div>
  );
}
