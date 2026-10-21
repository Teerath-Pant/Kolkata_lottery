import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, Coins, PageHeader } from '../components/ui';
import { useAuth } from '../lib/auth';

export function More() {
  const { user, balance, logout } = useAuth();
  const items = [
    { to: '/tickets', icon: '🎟️', label: 'My Tickets' },
    { to: '/tickets?tab=results', icon: '🏆', label: 'My Results' },
    { to: '/wallet', icon: '👛', label: 'My Wallet' },
    { to: '/verify', icon: '🔍', label: 'Verify a Draw' },
    { to: '/help', icon: '❓', label: 'Help & Support' },
    { to: '/settings', icon: '⚙️', label: 'Settings' },
  ];
  return (
    <div>
      <PageHeader title="My Profile" back={false} />
      <div className="space-y-4 p-4 md:mx-auto md:max-w-2xl md:px-6">
        <Card className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-2xl text-white">{user?.name.slice(0, 1).toUpperCase()}</div>
          <div className="flex-1">
            <div className="font-bold">{user?.name}</div>
            <div className="text-xs text-muted">+{user?.mobile}</div>
          </div>
          <Coins n={balance} />
        </Card>
        <Card className="divide-y divide-line !p-0">
          {items.map((i) => (
            <motion.div key={i.to} whileTap={{ scale: 0.98, backgroundColor: '#f2f5fb' }}>
              <Link to={i.to} className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium">
                <span className="text-lg">{i.icon}</span><span className="flex-1">{i.label}</span>
                <motion.span whileHover={{ x: 3 }} className="text-muted">›</motion.span>
              </Link>
            </motion.div>
          ))}
          <motion.button whileTap={{ scale: 0.98 }} onClick={logout} className="flex w-full items-center gap-3 px-4 py-3.5 text-sm font-medium text-bad">
            <span className="text-lg">🚪</span><span className="flex-1 text-left">Logout</span>
          </motion.button>
        </Card>
      </div>
    </div>
  );
}
