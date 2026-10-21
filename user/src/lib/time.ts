import { useEffect, useMemo, useState } from 'react';

/** Remaining ms until `target`, corrected for client/server clock skew using the server's timestamp. */
export function useCountdown(target?: string, serverTime?: string) {
  const skew = useMemo(() => (serverTime ? Date.parse(serverTime) - Date.now() : 0), [serverTime]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  return target ? Math.max(0, Date.parse(target) - (now + skew)) : 0;
}

export function fmtCountdown(ms: number) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const p = (n: number) => String(n).padStart(2, '0');
  const hms = `${p(Math.floor((s % 86400) / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
  return d ? `${d}d ${hms}` : hms;
}

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export const ticketLabel = (n: number) => String(n).padStart(4, '0');
export const fmtNum = (n: number) => n.toLocaleString('en-IN');
