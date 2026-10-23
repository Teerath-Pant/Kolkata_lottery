import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Coins, PageHeader } from '../components/ui';
import { Logo } from '../components/Logo';
import { useAuth } from '../lib/auth';
import { MENU_ITEMS } from '../lib/menu';

export function More() {
  const { user, balance, logout } = useAuth();
  return (
    <div>
      <PageHeader title="My Profile" back={false} />
      <div className="mx-auto max-w-md space-y-4 p-4 md:px-6">
        {/* Profile card */}
        <div className="flex items-center gap-3 rounded-card bg-white p-4 shadow-card">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-800 text-2xl font-bold text-white">
            {user?.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold">{user?.name}</div>
            <div className="text-xs text-muted">{user?.username}</div>
            {user?.verified && <span className="mt-1 inline-block rounded-pill bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">✔ Verified</span>}
          </div>
          <Coins n={balance} />
        </div>

        {/* Menu */}
        <div className="divide-y divide-line overflow-hidden rounded-card bg-white shadow-card">
          {MENU_ITEMS.map((i) => (
            <motion.div key={i.to} whileTap={{ backgroundColor: '#f2f5fb' }}>
              <Link to={i.to} className="flex items-center gap-3 px-4 py-3">
                <span className={`flex h-9 w-9 items-center justify-center rounded-full text-lg ${i.bg}`}>{i.icon}</span>
                <span className="flex-1 text-sm font-medium">{i.label}</span>
                <span className="text-lg text-muted">›</span>
              </Link>
            </motion.div>
          ))}
          <motion.button whileTap={{ backgroundColor: '#fff1f1' }} onClick={logout} className="flex w-full items-center gap-3 px-4 py-3 text-bad">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100 text-lg">🚪</span>
            <span className="flex-1 text-left text-sm font-semibold">Logout</span>
          </motion.button>
        </div>

        {/* Logo at bottom */}
        <div className="flex flex-col items-center pt-2">
          <Logo size={96} />
          <div className="mt-1 text-xs italic text-bad">Dreams Come True...</div>
        </div>
      </div>
    </div>
  );
}