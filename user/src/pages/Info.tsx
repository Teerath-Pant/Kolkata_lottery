import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { Button, Card, PageHeader } from '../components/ui';
import { APP_NAME, COIN_NOTE } from '../config';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime } from '../lib/time';
import type { MyComplaint } from '../lib/types';

const input = 'w-full rounded-btn border border-line bg-white px-3 py-2.5 text-[15px] text-ink shadow-sm outline-none transition placeholder:text-muted/80 focus:border-brand focus:shadow-glow';

function ComplaintForm() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const mine = useQuery({ queryKey: ['my-complaints'], queryFn: () => api<{ complaints: MyComplaint[] }>('/me/complaints'), enabled: !!user });
  const send = useMutation({
    mutationFn: () => api('/me/complaints', { body: { subject, message } }),
    onSuccess: () => {
      toast('Complaint sent. We will look into it.', 'success');
      setSubject(''); setMessage('');
      qc.invalidateQueries({ queryKey: ['my-complaints'] });
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Could not send', 'error'),
  });
  const ok = subject.trim().length >= 3 && message.trim().length >= 10;
  return (
    <div className="space-y-3">
      <Card>
        <div className="font-semibold">Report a problem</div>
        <p className="mt-1 text-sm text-muted">Something wrong? Tell us and our team will check it.</p>
        <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); if (ok) send.mutate(); }}>
          <input className={input} placeholder="Subject" value={subject} maxLength={100} onChange={(e) => setSubject(e.target.value)} required />
          <textarea className={`${input} min-h-28 resize-y`} placeholder="Describe your problem (at least 10 characters)" value={message} maxLength={1000} onChange={(e) => setMessage(e.target.value)} required />
          <div className="text-right text-[11px] text-muted">{message.length}/1000</div>
          <Button type="submit" disabled={!ok || send.isPending}>{send.isPending ? 'Sending…' : 'Send complaint'}</Button>
        </form>
      </Card>
      {!!mine.data?.complaints.length && (
        <Card>
          <div className="font-semibold">My complaints</div>
          <ul className="mt-2 divide-y divide-line">
            {mine.data.complaints.map((c) => (
              <li key={c.id} className="py-2">
                <div className="flex items-center justify-between gap-2">
                  <b className="min-w-0 truncate text-sm">{c.subject}</b>
                  <span className={`shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-semibold ${c.status === 'resolved' ? 'bg-green-100 text-good' : 'bg-gold/30 text-[#5a3a00]'}`}>
                    {c.status === 'resolved' ? 'Resolved' : 'Open'}
                  </span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-muted">{c.message}</p>
                <div className="mt-0.5 text-[11px] text-muted">{fmtDateTime(c.createdAt)}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

export function Help() {
  const { user } = useAuth();
  return (
    <div>
      <PageHeader title="Help & Support" />
      <div className="space-y-3 p-4 md:mx-auto md:max-w-2xl md:px-6">
        {user ? <ComplaintForm /> : (
          <Card className="text-center text-sm text-muted">
            <Link to="/login" className="font-semibold text-brand">Login</Link> to report a problem.
          </Card>
        )}
      </div>
    </div>
  );
}

export function Settings() {
  const { user } = useAuth();
  return (
    <div>
      <PageHeader title="Settings" />
      <div className="space-y-3 p-4 md:mx-auto md:max-w-2xl md:px-6">
        <Card>
          <div className="text-xs text-muted">Account</div>
          <div className="font-semibold">{user?.name}</div>
          <div className="text-sm text-muted">{user?.username}</div>
        </Card>
        <p className="text-center text-xs text-muted">{APP_NAME} · {COIN_NOTE}</p>
      </div>
    </div>
  );
}
