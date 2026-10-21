import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Item } from '../components/motion';
import { Button, Card, ErrorBox, ModeBadge, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { ticketLabel } from '../lib/time';
import type { VerifyData } from '../lib/types';
import { verifyDraw } from '../lib/verify';

type Result = Awaited<ReturnType<typeof verifyDraw>>;

const Row = ({ ok, label, value }: { ok?: boolean; label: string; value: string }) => (
  <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }} className="py-2 text-sm">
    <div className="flex items-center gap-2 font-semibold">
      {ok === undefined ? '•' : (
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 15, delay: 0.15 }} className={ok ? 'text-good' : 'text-bad'}>{ok ? '✓' : '✗'}</motion.span>
      )}
      {label}
    </div>
    <div className="break-all pl-5 font-mono text-[11px] text-muted">{value}</div>
  </motion.div>
);

export function Verify() {
  const { id } = useParams();
  const nav = useNavigate();
  const [input, setInput] = useState(id ?? '');
  const q = useQuery({ queryKey: ['verify', id], queryFn: () => api<VerifyData>(`/draws/${id}/verify`), enabled: !!id, retry: false });
  const [res, setRes] = useState<Result | null>(null);

  useEffect(() => { setRes(null); if (q.data) verifyDraw(q.data).then(setRes); }, [q.data]);

  const submit = (e: FormEvent) => { e.preventDefault(); if (input) nav(`/verify/${input.trim()}`); };
  const v = q.data;

  return (
    <div>
      <PageHeader title="Verify a Draw" />
      <div className="space-y-4 p-4 md:mx-auto md:max-w-3xl md:px-6">
        <Item className="contents"><form onSubmit={submit} className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Draw ID"
            className="flex-1 rounded-btn border border-line bg-white px-4 py-3" />
          <div className="w-24 shrink-0 min-[380px]:w-28"><Button>Verify</Button></div>
        </form></Item>
        <Item><p className="text-xs text-muted">
          Before each draw we publish SHA-256(serverSeed). After the draw the seed is revealed. In Random draws the winner is
          <code> sortedSoldTickets[HMAC_SHA256(serverSeed, drawId) mod soldCount]</code>. This page recomputes everything in your browser.
        </p></Item>

        {id && q.isLoading && <Spinner label="Fetching draw…" />}
        {id && q.error && <ErrorBox error={q.error} />}
        {v && (
          <Card>
            <div className="mb-2 flex items-center justify-between"><b>Draw #{v.drawId}</b><ModeBadge mode={v.mode} className="!bg-brand-light !text-brand-dark" /></div>
            {v.winningTicketNo === null ? <p className="text-sm text-muted">This draw was cancelled; there is no winner.</p> : !res ? <Spinner label="Computing…" /> : (
              <div className="divide-y divide-line">
                <Row label="Published hash" value={v.serverSeedHash} />
                <Row label="Revealed seed" value={v.serverSeed} />
                <Row ok={res.hashMatches} label="SHA-256(seed) equals published hash" value={res.hash} />
                <Row label={`HMAC_SHA256(seed, "${v.drawId}")`} value={res.hmac} />
                <Row label={`Sold tickets: ${res.count}`} value={`index = HMAC mod ${res.count} = ${res.index}  →  #${res.computedWinner === null ? '-' : ticketLabel(res.computedWinner)}`} />
                {res.seedDerived ? (
                  <Row ok={res.winnerMatches} label={res.winnerMatches ? 'Recomputed winner matches the announced winner' : 'MISMATCH with announced winner'} value={`announced #${ticketLabel(v.winningTicketNo)}`} />
                ) : (
                  <Row label="Admin-selected winner: not derived from the seed" value={`announced #${ticketLabel(v.winningTicketNo)}. The mode was shown publicly before the draw and every admin action is audit-logged.`} />
                )}
                {v.winMethod === 'fallback_random' && <Row label="Fallback used" value="Mode was admin-selected but no valid ticket was chosen, so the seed-derived random winner was used." />}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
