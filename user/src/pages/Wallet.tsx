import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { CountUp } from '../components/motion';
import { useToast } from '../components/Toast';
import { Card, Coins, Empty, ErrorBox, PageHeader, Spinner } from '../components/ui';
import { COIN_NOTE } from '../config';
import { api } from '../lib/api';
import { fmtDateTime } from '../lib/time';
import type { WalletInfo } from '../lib/types';

const LABEL: Record<string, string> = {
  signup_bonus: 'Signup bonus', daily_claim: 'Daily free coins', ticket_purchase: 'Ticket purchase',
  prize: 'Prize won', refund: 'Refund', admin_adjust: 'Admin adjustment',
};

const QUICK_AMOUNTS = [100, 500, 1000, 2000];

export function Wallet() {
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [amount, setAmount] = useState(500);

  const q = useQuery({ queryKey: ['wallet'], queryFn: () => api<WalletInfo>('/me/wallet'), refetchInterval: 10_000 });
  const w = q.data;

  // Abhi sirf UI hai. Backend ready hone par yahan API call lagana.
  const onProceed = () => {
    if (amount < 1) { toast('Amount likho', 'error'); return; }
    toast('Add Money abhi available nahi hai (payment connect nahi hai)', 'error');
    setAddOpen(false);
  };

  return (
    <div>
      <PageHeader title="My Wallet" back={false} />
      {q.isLoading ? <Spinner /> : q.error || !w ? <ErrorBox error={q.error} retry={() => q.refetch()} /> : (
        <div className="space-y-4 p-4 md:mx-auto md:grid md:max-w-5xl md:grid-cols-2 md:items-start md:gap-6 md:space-y-0 md:px-6">
          <div className="space-y-4">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-muted">Coin balance</div>
                <div className="flex items-center gap-1.5 text-3xl font-extrabold text-brand-dark min-[380px]:text-4xl"><span>Rs</span><CountUp value={w.balance} /></div>
              </div>
              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={() => setAddOpen(true)}
                className="shrink-0 rounded-btn bg-gradient-to-b from-green-500 to-green-700 px-4 py-2 text-sm font-bold text-white shadow-card"
              >
                + Add Money
              </motion.button>
            </div>
            <p className="mt-1 text-[11px] text-muted">{COIN_NOTE}</p>
          </Card>

          <div className="grid grid-cols-3 gap-3">
            <Card className="!bg-orange-50 text-center !px-2">
              <div className="text-2xl">💰</div>
              <div className="text-xs text-muted">Deposit</div>
              <Coins n={(w as WalletInfo & { deposit?: number }).deposit ?? 0} />
            </Card>
            <Card className="!bg-green-50 text-center !px-2">
              <motion.div animate={{ rotate: [0, -10, 10, 0] }} transition={{ repeat: Infinity, duration: 3, repeatDelay: 2 }} className="text-2xl">🏆</motion.div>
              <div className="text-xs text-muted">Winnings</div>
              <Coins n={w.winnings} />
            </Card>
            <Card className="!bg-blue-50 text-center !px-2">
              <div className="text-2xl">🎁</div>
              <div className="text-xs text-muted">Bonus</div>
              <Coins n={w.bonus} />
            </Card>
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

      {/* Add Money panel */}
      <AnimatePresence>
        {addOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setAddOpen(false)}
          >
            <motion.div
              className="w-full max-w-md rounded-t-card bg-white p-4 pb-6 md:rounded-card"
              initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-bold text-brand-dark">Add Money</h3>
                <button type="button" aria-label="Close" onClick={() => setAddOpen(false)} className="p-1 text-xl text-muted">✕</button>
              </div>

              <label className="block text-xs font-medium text-muted">Amount</label>
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="mt-1 w-full rounded-btn border border-line px-3 py-2 text-lg font-bold"
              />

              <div className="mt-3 grid grid-cols-4 gap-2">
                {QUICK_AMOUNTS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAmount(a)}
                    className={`rounded-btn border py-2 text-sm font-semibold ${amount === a ? 'border-green-600 bg-green-50 text-green-700' : 'border-line text-ink'}`}
                  >
                    {a}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={onProceed}
                className="mt-4 w-full rounded-btn bg-gradient-to-b from-green-500 to-green-700 py-3 font-bold text-white shadow-card"
              >
                Proceed
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}