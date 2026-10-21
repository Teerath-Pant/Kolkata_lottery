const BASE = '/api/v1';
const KEY = 'ltd.admin.tokens';

interface Tokens { accessToken: string; refreshToken: string }

export const tokens = {
  get(): Tokens | null {
    try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; }
  },
  set(t: Tokens) { localStorage.setItem(KEY, JSON.stringify(t)); },
  clear() { localStorage.removeItem(KEY); },
};

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

let refreshing: Promise<boolean> | null = null;
function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    const t = tokens.get();
    if (!t) return false;
    try {
      const r = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: t.refreshToken }),
      });
      if (!r.ok) { tokens.clear(); return false; }
      const j = await r.json();
      tokens.set({ accessToken: j.accessToken, refreshToken: j.refreshToken });
      return true;
    } catch { return false; }
  })().finally(() => { refreshing = null; });
  return refreshing;
}

interface Opts { method?: string; body?: unknown; headers?: Record<string, string> }

export async function api<T>(path: string, opts: Opts = {}, retried = false): Promise<T> {
  const t = tokens.get();
  const res = await fetch(BASE + path, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: {
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(t ? { Authorization: `Bearer ${t.accessToken}` } : {}),
      ...opts.headers,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && t && !retried && !path.startsWith('/auth/') && (await refresh())) return api<T>(path, opts, true);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? 'ERROR', data?.error?.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}
