import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CountUp } from '../components/motion';
import { useToast } from '../components/Toast';
import { Button, Card, Coin, Coins, Countdown, Empty, ErrorBox, PageHeader, Spinner } from '../components/ui';
import { COIN_NOTE } from '../config';
import { api } from '../lib/api';
import { fmtDateTime } from '../lib/time';
import type { WalletInfo } from '../lib/types';

const LABEL: Record<string, string> = {
  signup_bonus: 'Signup bonus', daily_claim: 'Daily free coins', ticket_purchase: 'Ticket purchase',
  prize: 'Prize won', refund: 'Refund', admin_adjust: 'Admin adjustment',
};

export function Wallet() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['wallet'], queryFn: () => api<WalletInfo>('/me/wallet'), refetchInterval: 10_000 });
  const claim = useMutation({
    mutationFn: () => api<{ claimed: number }>('/me/daily-claim', { method: 'POST' }),
    onSuccess: (r) => { toast(`+${r.claimed} coins claimed!`, 'success'); qc.invalidateQueries({ queryKey: ['wallet'] }); qc.invalidateQueries({ queryKey: ['me'] }); },
    onError: (e) => { toast(e instanceof Error ? e.message : 'Claim failed', 'error'); qc.invalidateQueries({ queryKey: ['wallet'] }); },
  });
  const w = q.data;

  return (
    <div>
      <PageHeader title="My Wallet" back={false} />
      {q.isLoading ? <Spinner /> : q.error || !w ? <ErrorBox error={q.error} retry={() => q.refetch()} /> : (
        <div className="space-y-4 p-4 md:mx-auto md:grid md:max-w-5xl md:grid-cols-2 md:items-start md:gap-6 md:space-y-0 md:px-6">
          <div className="space-y-4">
          <Card>
            <div className="text-xs text-muted">Coin balance</div>
            <div className="flex items-center gap-1.5 text-3xl font-extrabold text-brand-dark min-[380px]:text-4xl"><Coin size={32} /><CountUp value={w.balance} /></div>
            <p className="mt-1 text-[11px] text-muted">🪙 {COIN_NOTE}</p>
          </Card>

          <Card className="!bg-gold-light">
            <div className="flex flex-col gap-3 min-[380px]:flex-row min-[380px]:items-center min-[380px]:justify-between">
              <div>
                <div className="font-semibold">Daily free coins</div>
                <div className="text-xs text-muted">
                  {w.canClaim ? <>Claim <Coins n={w.dailyClaimAmount} size={12} /> once every 24 hours</>
                    : <>Next claim in <Countdown target={w.nextClaimAt!} done="a moment" /></>}
                </div>
              </div>
              <div className="w-full min-[380px]:w-36">
                <Button variant="gold" disabled={!w.canClaim || claim.isPending} onClick={() => claim.mutate()}>
                  {claim.isPending ? '…' : w.canClaim ? 'Claim' : 'Claimed'}
                </Button>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Card className="text-center"><motion.div animate={{ rotate: [0, -10, 10, 0] }} transition={{ repeat: Infinity, duration: 3, repeatDelay: 2 }} className="text-2xl">🏆</motion.div><div className="text-xs text-muted">Winnings</div><Coins n={w.winnings} /></Card>
            <Card className="text-center"><div className="text-2xl">🎁</div><div className="text-xs text-muted">Bonus</div><Coins n={w.bonus} /></Card>
          </div>

          </div>

          <div className="space-y-4">
          <h2 className="font-semibold md:text-lg">Recent transactions</h2>
          {w.recent.length === 0 ? <Empty>No transactions yet.</Empty> : (
            <Card className="divide-y divide-line !p-0">
              {w.recent.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="text-sm font-medium">{LABEL[r.type] ?? r.type}{r.refId && r.type !== 'admin_adjust' ? ` · Draw #${r.refId}` : ''}</div>
                    <div className="text-[11px] text-muted">{fmtDateTime(r.createdAt)} · bal {r.balanceAfter}</div>
                  </div>
                  <span className={`font-bold ${r.amount >= 0 ? 'text-good' : 'text-bad'}`}>{r.amount >= 0 ? '+' : ''}{r.amount}</span>
                </div>
              ))}
            </Card>
          )}
          </div>
        </div>
      )}
    </div>
  );
}
