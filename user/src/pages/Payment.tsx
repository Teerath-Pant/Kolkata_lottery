import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useToast } from '../components/Toast';
import { PageHeader } from '../components/ui';

const QUICK = [100, 200, 500, 1000, 2000, 5000];

const METHODS = [
  { id: 'upi', icon: '📲', title: 'UPI', sub: 'PhonePe, GPay, Paytm, etc.' },
 
];

export function Payment() {
  const nav = useNavigate();
  const toast = useToast();
  const [sp] = useSearchParams();
  const start = Number(sp.get('amount')) || 100;
  const [amount, setAmount] = useState<number>(start);
  const [method, setMethod] = useState('upi');

  const pay = () => {
    if (!amount || amount < 1) { toast('Amount likho', 'error'); return; }
    // Abhi sirf UI hai. Backend ready hone par yahan API call lagana.
    toast('Payment abhi connect nahi hai', 'error');
  };

  return (
    <div>
      <PageHeader title="Payment" />
      <div className="mx-auto max-w-md space-y-4 p-4 md:px-6">
        {/* Total amount */}
        <div className="rounded-card bg-white p-4 shadow-card">
          <div className="text-xs font-semibold text-muted">Total Amount</div>
          <div className="mt-1 flex items-center gap-1 text-3xl font-extrabold text-brand-dark">
            <span>₹</span>
            <input
              type="number"
              min={1}
              value={amount || ''}
              onChange={(e) => setAmount(Number(e.target.value))}
              placeholder="0"
              className="w-full bg-transparent outline-none"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAmount(a)}
                className={`rounded-pill border px-3 py-1 text-sm font-semibold ${amount === a ? 'border-green-600 bg-green-50 text-green-700' : 'border-line text-ink'}`}
              >
                ₹{a}
              </button>
            ))}
          </div>
        </div>

        {/* Payment method */}
        <div>
          <div className="mb-2 text-sm font-bold text-brand-dark">Select Payment Method</div>
          <div className="space-y-2">
            {METHODS.map((m) => {
              const on = method === m.id;
              return (
                <motion.button
                  key={m.id}
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setMethod(m.id)}
                  className={`flex w-full items-center gap-3 rounded-card border-2 bg-white p-3 text-left shadow-card ${on ? 'border-green-500' : 'border-transparent'}`}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-xl">{m.icon}</span>
                  <span className="flex-1">
                    <span className="block text-sm font-bold">{m.title}</span>
                    <span className="block text-[11px] text-muted">{m.sub}</span>
                  </span>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs text-white ${on ? 'border-green-500 bg-green-500' : 'border-line'}`}>
                    {on && '✓'}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={pay}
          className="w-full rounded-btn bg-gradient-to-b from-red-500 to-red-700 py-3 text-lg font-bold text-white shadow-card"
        >
          Pay Now{amount ? ` · ₹${amount}` : ''}
        </button>
        <p className="text-center text-[11px] text-muted">🔒 100% Secure &amp; Encrypted</p>
        <button type="button" onClick={() => nav(-1)} className="block w-full text-center text-sm font-semibold text-brand">Cancel</button>
      </div>
    </div>
  );
}