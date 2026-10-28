import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useToast } from '../components/Toast';
import { Card, Empty, field, Load } from '../components/ui';
import { api } from '../lib/api';
import { fmtDateTime } from '../lib/time';
import type { ComplaintPage, ComplaintRow } from '../lib/types';

const SIZES = [10, 25, 50, 100];

/** Problems players send from the Help page of the player app, newest first. */
export function Complaints() {
  const [sp, setSp] = useSearchParams();
  const status = sp.get('status') === 'open' || sp.get('status') === 'resolved' ? sp.get('status')! : '';
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const pageSize = SIZES.includes(Number(sp.get('size'))) ? Number(sp.get('size')) : 25;
  const set = (patch: Record<string, string | number>) => setSp((prev) => {
    Object.entries(patch).forEach(([k, v]) => (v === '' ? prev.delete(k) : prev.set(k, String(v))));
    return prev;
  });

  const q = useQuery({
    queryKey: ['admin-complaints', status, page, pageSize],
    queryFn: () => {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (status) qs.set('status', status);
      return api<ComplaintPage>(`/admin/complaints?${qs}`);
    },
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });
  const btn = 'rounded-btn border border-line bg-white px-3 py-1.5 text-sm font-semibold disabled:opacity-40';

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">Problems and complaints sent by players from the Help page.</p>
        <div className="flex gap-2">
          <select className={`${field} sm:!w-40`} value={status} onChange={(e) => set({ status: e.target.value, page: 1 })} aria-label="Filter by status">
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>
          <select className={`${field} !w-28`} value={pageSize} onChange={(e) => set({ size: e.target.value, page: 1 })} aria-label="Rows per page">
            {SIZES.map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
        </div>
      </div>
      <Load q={q}>{(d) => (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Card><div className="text-xs text-muted">Open</div><div className="text-xl font-extrabold text-brand-dark sm:text-2xl">{d.open}</div></Card>
            <Card><div className="text-xs text-muted">{status ? `Matching ${status}` : 'Total'}</div><div className="text-xl font-extrabold text-brand-dark sm:text-2xl">{d.total}</div></Card>
          </div>
          {d.total === 0 ? <Empty>{status ? `No ${status} complaints.` : 'No complaints yet.'}</Empty> : (
            <div className={`grid gap-3 md:grid-cols-2 ${q.isPlaceholderData ? 'opacity-60' : ''}`}>
              {d.complaints.map((c) => <ComplaintCard key={c.id} c={c} />)}
            </div>
          )}
          {d.pages > 1 && (
            <nav className="flex items-center justify-center gap-3" aria-label="Pagination">
              <button type="button" className={btn} disabled={d.page <= 1} onClick={() => { set({ page: d.page - 1 }); window.scrollTo({ top: 0 }); }}>‹ Prev</button>
              <span className="text-sm text-muted">Page {d.page} of {d.pages}</span>
              <button type="button" className={btn} disabled={d.page >= d.pages} onClick={() => { set({ page: d.page + 1 }); window.scrollTo({ top: 0 }); }}>Next ›</button>
            </nav>
          )}
        </>
      )}</Load>
    </div>
  );
}

function ComplaintCard({ c }: { c: ComplaintRow }) {
  const qc = useQueryClient();
  const toast = useToast();
  const resolved = c.status === 'resolved';
  const m = useMutation({
    mutationFn: () => api(`/admin/complaints/${c.id}`, { method: 'PATCH', body: { status: resolved ? 'open' : 'resolved' } }),
    onSuccess: () => {
      toast(resolved ? 'Complaint reopened' : 'Complaint resolved', 'success');
      ['admin-complaints', 'admin-audit'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Failed', 'error'),
  });
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <b className="min-w-0 break-words">{c.subject}</b>
        <span className={`shrink-0 rounded-pill px-2.5 py-0.5 text-[11px] font-semibold ${resolved ? 'bg-green-100 text-good' : 'bg-gold text-[#5a3a00]'}`}>{resolved ? 'Resolved' : 'Open'}</span>
      </div>
      <div className="text-xs text-muted">{c.name} · {c.username} · user id {c.userId}</div>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm">{c.message}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="text-[11px] text-muted">
          #{c.id} · {fmtDateTime(c.createdAt)}{c.resolvedAt && ` · resolved ${fmtDateTime(c.resolvedAt)}`}
        </div>
        <motion.button whileTap={{ scale: 0.92 }} disabled={m.isPending} onClick={() => m.mutate()}
          className={`shrink-0 rounded-btn px-3 py-1.5 text-sm font-semibold disabled:opacity-50 ${resolved ? 'border border-brand/30 bg-white text-brand' : 'bg-brand text-white'}`}>
          {resolved ? 'Reopen' : 'Mark resolved'}
        </motion.button>
      </div>
    </Card>
  );
}
