import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, PageHeader } from '../components/ui';
import { APP_NAME, COIN_NOTE } from '../config';
import { useAuth } from '../lib/auth';

const FAQ: [string, string][] = [
  ['Are coins real money?', `No. ${COIN_NOTE}. They cannot be bought or cashed out.`],
  ['How do I get coins?', 'You get a signup bonus when you register. Play coins only, no real value.'],
  ['How many tickets can I buy?', 'As many as you like in one draw, one number per ticket. Each booking picks a free number or a Random Number and costs the ticket price. More tickets means more chances.'],
  ['How is the winner chosen?', 'Each draw shows its mode: "Random draw" (provably fair, verifiable on the Verify page) or "Admin-selected winner".'],
  ['What if a draw does not fill up?', 'If fewer than the minimum tickets are sold the draw is cancelled and all tickets are refunded.'],
];

export function Help() {
  return (
    <div>
      <PageHeader title="Help & Support" />
      <div className="grid gap-3 p-4 md:mx-auto md:max-w-5xl md:grid-cols-2 md:gap-4 md:px-6">
        {FAQ.map(([q, a]) => (
          <Card key={q}><div className="font-semibold">{q}</div><p className="mt-1 text-sm text-muted">{a}</p></Card>
        ))}
      </div>
    </div>
  );
}

export function Settings() {
  const { user } = useAuth();
  const [calm, setCalm] = useState(() => { try { return localStorage.getItem('ltd.calm') === '1'; } catch { return false; } });
  const toggle = () => { const n = !calm; setCalm(n); try { localStorage.setItem('ltd.calm', n ? '1' : '0'); } catch { /* ignore */ } };
  return (
    <div>
      <PageHeader title="Settings" />
      <div className="space-y-3 p-4 md:mx-auto md:max-w-2xl md:px-6">
        <Card>
          <div className="text-xs text-muted">Account</div>
          <div className="font-semibold">{user?.name}</div>
          <div className="text-sm text-muted">{user?.username}</div>
        </Card>
        <Card className="flex items-center justify-between">
          <div><div className="font-semibold">Reduce celebration effects</div><div className="text-xs text-muted">Saved on this device</div></div>
          <button role="switch" aria-checked={calm} onClick={toggle} className={`flex h-7 w-12 shrink-0 rounded-pill p-0.5 transition-colors ${calm ? 'justify-end bg-good' : 'justify-start bg-gray-300'}`}>
            <motion.span layout transition={{ type: 'spring', stiffness: 500, damping: 30 }} className="block h-6 w-6 rounded-full bg-white shadow" />
          </button>
        </Card>
        <p className="text-center text-xs text-muted">{APP_NAME} · {COIN_NOTE}</p>
      </div>
    </div>
  );
}
