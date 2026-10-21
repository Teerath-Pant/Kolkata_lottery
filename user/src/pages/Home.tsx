import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CountUp, Item, item } from '../components/motion';
import { PackageTile } from '../components/PackageCard';
import { Coin, Countdown, ErrorBox, Spinner } from '../components/ui';
import { APP_NAME } from '../config';
import { Logo } from '../components/Logo';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Pkg } from '../lib/types';
import { headerGradient } from '../theme';

const MLink = motion.create(Link);

export function Home() {
  const { user, balance } = useAuth();
  const q = useQuery({
    queryKey: ['packages'],
    queryFn: () => api<{ packages: Pkg[]; serverTime: string }>('/packages'),
    refetchInterval: 5000,
  });
  const next = q.data?.packages.map((p) => p.currentDraw).filter(Boolean).sort((a, b) => +new Date(a!.drawTime) - +new Date(b!.drawTime))[0];

  return (
    <div>
      <header className="flex items-center gap-3 px-4 py-3 text-white md:hidden" style={headerGradient}>
        <Logo size={48} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-gold">{APP_NAME}</div>
          <div className="truncate text-[11px] text-white/70">Hi {user?.name}</div>
        </div>
        <Link to="/wallet" className="rounded-pill bg-white/15 px-3 py-1.5 text-sm"><span className="inline-flex items-center gap-1 font-semibold"><Coin /><CountUp value={balance} /></span></Link>
      </header>

      <div className="space-y-4 p-4 md:mx-auto md:max-w-5xl md:space-y-6 md:px-6 md:py-8">
        <Item className="relative overflow-hidden rounded-card bg-gradient-to-br from-gold-light to-white p-4 shadow-card md:p-8">
          <motion.span animate={{ opacity: [1, 0.45, 1] }} transition={{ repeat: Infinity, duration: 1.6 }} className="absolute right-3 top-3 rounded-pill bg-bad px-2 py-0.5 text-[10px] font-bold uppercase text-white">● Live</motion.span>
          <div className="hidden text-lg font-semibold text-ink md:block">Welcome back, {user?.name}</div>
          <div className="text-xs font-medium text-muted md:text-sm">Next draw closes in</div>
          <div className="text-3xl font-extrabold text-brand-dark md:text-5xl">
            {next ? <Countdown target={next.drawTime} serverTime={next.serverTime} /> : '--:--:--'}
          </div>
          <div className="text-xs italic text-muted">Pick your lucky number. One ticket per draw.</div>
        </Item>

        <Item className="flex items-center justify-between">
          <h2 className="font-semibold md:text-xl">Choose your draw</h2>
          <Link to="/packages" className="text-sm font-semibold text-brand">View all</Link>
        </Item>

        {q.isLoading ? <Spinner /> : q.error ? <ErrorBox error={q.error} retry={() => q.refetch()} /> : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
            {q.data!.packages.map((p) => <PackageTile key={p.id} pkg={p} />)}
            <MLink to="/results" variants={item} whileTap={{ scale: 0.96 }} whileHover={{ y: -3 }} className="flex flex-col items-center justify-center rounded-card bg-gradient-to-br from-gold to-gold-dark p-3 text-center font-bold text-[#4a2e00] shadow-card">
              <span className="text-3xl">📋</span>All Results<span className="text-xs font-medium">View all</span>
            </MLink>
          </div>
        )}
      </div>
    </div>
  );
}
