import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useToast } from '../components/Toast';
import { Button, Card, Empty, field, Load, ModeBadge } from '../components/ui';
import { api } from '../lib/api';
import { fmtDateTime, ticketLabel } from '../lib/time';
import type { AdminDraw, DrawMode } from '../lib/types';

export function Draws() {
  const [status, setStatus] = useState('open');
  const q = useQuery({
    queryKey: ['admin-draws', status],
    queryFn: () => api<{ draws: AdminDraw[] }>(`/admin/draws${status ? `?status=${status}` : ''}`),
    refetchInterval: 8000,
  });
  return (
    <div className="space-y-3">
      <select className={`${field} !w-48`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
        <option value="open">Open draws</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="">All</option>
      </select>
      <Load q={q}>{(d) => d.draws.length === 0 ? <Empty>No draws.</Empty> : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{d.draws.map((x) => <DrawCard key={x.id} d={x} />)}</div>
      )}</Load>
    </div>
  );
}

function DrawCard({ d }: { d: AdminDraw }) {
  const [no, setNo] = useState('');
  const qc = useQueryClient();
  const toast = useToast();
  const act = {
    onSuccess: () => { toast('Updated', 'success'); ['admin-draws', 'admin-audit'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); },
    onError: (e: unknown) => toast(e instanceof Error ? e.message : 'Failed', 'error'),
  };
  const editable = d.status === 'open' && Date.parse(d.drawTime) > Date.now();
  const mode = useMutation({ mutationFn: (m: DrawMode) => api(`/admin/draws/${d.id}/mode`, { body: { mode: m } }), ...act });
  const pick = useMutation({ mutationFn: () => api(`/admin/draws/${d.id}/select-winner`, { body: { ticketNo: Number(no) } }), ...act, onSuccess: () => { act.onSuccess(); setNo(''); } });

  return (
    <Card>
      <div className="flex items-center justify-between">
        <b>#{d.id} · {d.packageName}</b>
        <span className="rounded-pill bg-brand-light px-2 py-0.5 text-[11px] font-semibold capitalize text-brand-dark">{d.status}</span>
      </div>
      <div className="text-xs text-muted">{fmtDateTime(d.drawTime)} · sold {d.sold}/{d.maxTickets}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ModeBadge mode={d.mode} />
        {d.selectedTicketNo && <span className="text-xs">Selected: <b>#{ticketLabel(d.selectedTicketNo)}</b></span>}
        {d.winningTicketNo && <span className="text-xs">Winner: <b>#{ticketLabel(d.winningTicketNo)}</b> ({d.winMethod})</span>}
      </div>
      {editable ? (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <motion.button whileTap={{ scale: 0.94 }} disabled={mode.isPending} onClick={() => mode.mutate('random')}
              className={`flex-1 rounded-btn border py-2 text-xs font-semibold ${d.mode === 'random' ? 'border-brand bg-brand text-white' : 'border-line'}`}>Random draw</motion.button>
            <motion.button whileTap={{ scale: 0.94 }} disabled={mode.isPending} onClick={() => mode.mutate('admin_selected')}
              className={`flex-1 rounded-btn border py-2 text-xs font-semibold ${d.mode === 'admin_selected' ? 'border-gold-dark bg-gold' : 'border-line'}`}>Admin-selected</motion.button>
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); pick.mutate(); }}>
            <input className={field} inputMode="numeric" placeholder={`Winning ticket 1-${d.maxTickets}`} value={no} onChange={(e) => setNo(e.target.value.replace(/\D/g, ''))} />
            <div className="w-24"><Button disabled={!no || pick.isPending}>Set</Button></div>
          </form>
          <p className="text-[11px] text-muted">Used only in Admin-selected mode. If that ticket is unsold at draw time, a random winner is drawn and logged. The mode is shown publicly to players.</p>
        </div>
      ) : d.status === 'open' && <p className="mt-2 text-xs text-muted">Locked: draw time reached.</p>}
    </Card>
  );
}
