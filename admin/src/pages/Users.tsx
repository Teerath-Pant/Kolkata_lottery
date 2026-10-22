import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useToast } from '../components/Toast';
import { Card, Coins, field, Load } from '../components/ui';
import { api } from '../lib/api';
import { fmtDateTime } from '../lib/time';
import type { ManagedUser } from '../lib/types';

export function Users() {
  const [search, setSearch] = useState('');
  const q = useQuery({ queryKey: ['admin-users'], queryFn: () => api<{ users: ManagedUser[] }>('/admin/users') });
  return (
    <div className="space-y-3">
      <input className={`${field} md:!w-72`} placeholder="Search name or mobile" value={search} onChange={(e) => setSearch(e.target.value)} />
      <Load q={q}>{(d) => {
        const s = search.trim().toLowerCase();
        const rows = d.users.filter((u) => !s || u.name.toLowerCase().includes(s) || u.mobile.includes(s));
        return <div className="grid gap-3 md:grid-cols-2">{rows.map((u) => <UserRow key={u.id} u={u} />)}</div>;
      }}</Load>
      <p className="text-center text-[11px] text-muted">Showing the 100 newest users.</p>
    </div>
  );
}

function UserRow({ u }: { u: ManagedUser }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const qc = useQueryClient();
  const toast = useToast();
  const adj = useMutation({
    mutationFn: () => api(`/admin/users/${u.id}/adjust-coins`, { body: { amount: Number(amount), reason } }),
    onSuccess: () => {
      toast('Coins adjusted', 'success'); setAmount(''); setReason('');
      ['admin-users', 'admin-audit'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Failed', 'error'),
  });
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <b className="min-w-0 truncate">{u.name} <span className="text-xs font-normal text-muted">({u.role})</span></b>
        <Coins n={u.balance ?? 0} />
      </div>
      <div className="text-xs text-muted">+{u.mobile} · id {u.id} · joined {fmtDateTime(u.createdAt)}</div>
      <form className="mt-2 flex flex-wrap gap-2 min-[420px]:flex-nowrap" onSubmit={(e) => { e.preventDefault(); adj.mutate(); }}>
        <input className={`${field} !w-24 shrink-0`} type="number" placeholder="± coins" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <input className={`${field} min-w-0 flex-1`} placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} />
        <motion.button whileTap={{ scale: 0.92 }} disabled={adj.isPending || !Number(amount)} className="rounded-btn bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Apply</motion.button>
      </form>
    </Card>
  );
}
