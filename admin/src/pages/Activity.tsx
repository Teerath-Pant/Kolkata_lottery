import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Card, Empty, field, Load } from '../components/ui';
import { api } from '../lib/api';
import { ACTION_LABEL, describe, target, who } from '../lib/audit';
import { fmtDateTime } from '../lib/time';
import type { AuditPage } from '../lib/types';

const SIZES = [10, 25, 50, 100];

/** Page numbers to show: first, last, and a window around the current page, with gaps as null. */
function pageList(page: number, pages: number): (number | null)[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const out: (number | null)[] = [];
  [...keep].sort((a, b) => a - b).forEach((n, i, arr) => {
    if (i && n - arr[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (n: number) => void }) {
  const btn = 'min-w-9 rounded-btn border px-2.5 py-1.5 text-sm font-semibold disabled:opacity-40';
  return (
    <nav className="flex flex-wrap items-center justify-center gap-1" aria-label="Pagination">
      <button type="button" className={`${btn} border-line bg-white`} disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Prev</button>
      {pageList(page, pages).map((n, i) => n === null
        ? <span key={`gap${i}`} className="px-1 text-muted">…</span>
        : (
          <button
            key={n} type="button" onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined}
            className={`${btn} ${n === page ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink'}`}
          >
            {n}
          </button>
        ))}
      <button type="button" className={`${btn} border-line bg-white`} disabled={page >= pages} onClick={() => onPage(page + 1)}>Next ›</button>
    </nav>
  );
}

/** Every change made from the admin panel (stored in admin_audit_log), newest first. */
export function Activity() {
  const [sp, setSp] = useSearchParams();
  const action = sp.get('action') ?? '';
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const pageSize = SIZES.includes(Number(sp.get('size'))) ? Number(sp.get('size')) : 25;
  const set = (patch: Record<string, string | number>) => setSp((prev) => {
    Object.entries(patch).forEach(([k, v]) => (v === '' ? prev.delete(k) : prev.set(k, String(v))));
    return prev;
  });

  const q = useQuery({
    queryKey: ['admin-audit', 'page', action, page, pageSize],
    queryFn: () => {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (action) qs.set('action', action);
      return api<AuditPage>(`/admin/audit-log?${qs}`);
    },
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  const goto = (n: number) => { set({ page: n }); window.scrollTo({ top: 0 }); };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">Every change made from the admin panel: who, when, what it was before and after.</p>
        <div className="flex gap-2">
          <select className={`${field} sm:!w-56`} value={action} onChange={(e) => set({ action: e.target.value, page: 1 })} aria-label="Filter by action">
            <option value="">All actions</option>
            {Object.entries(ACTION_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className={`${field} !w-28`} value={pageSize} onChange={(e) => set({ size: e.target.value, page: 1 })} aria-label="Rows per page">
            {SIZES.map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
        </div>
      </div>
      <Load q={q}>{(d) => d.total === 0 ? <Empty>No admin activity yet.</Empty> : (
        <div className={`space-y-2 ${q.isPlaceholderData ? 'opacity-60' : ''}`}>
          <p className="text-xs text-muted">
            Showing {(d.page - 1) * d.pageSize + 1}–{Math.min(d.page * d.pageSize, d.total)} of {d.total}
          </p>
          {d.log.length === 0 ? <Empty>This page is empty.</Empty> : d.log.map((a) => (
            <Card key={a.id}>
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <div className="min-w-0">
                  <b>{ACTION_LABEL[a.action] ?? a.action}</b>
                  {target(a) && <div className="text-xs text-muted">{target(a)}</div>}
                </div>
                <div className="text-right text-xs text-muted">
                  <div>{fmtDateTime(a.createdAt)}</div>
                  <div>by <b className="text-ink">{who(a)}</b>{a.ip ? ` · ${a.ip}` : ''}</div>
                </div>
              </div>
              <ul className="mt-2 space-y-0.5 border-t border-line pt-2 text-sm">
                {describe(a).map((l, i) => <li key={i} className="break-words">{l}</li>)}
              </ul>
            </Card>
          ))}
          {d.pages > 1 && <Pager page={Math.min(page, d.pages)} pages={d.pages} onPage={goto} />}
        </div>
      )}</Load>
    </div>
  );
}
