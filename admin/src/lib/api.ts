const BASE = '/api/v1';

// Tokens live in httpOnly cookies set by the server; this code never sees them.
// X-Client picks the admin cookie pair (separate from the player app's) and doubles as the server's CSRF guard.
const CLIENT = { 'X-Client': 'admin' };

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

let refreshing: Promise<boolean> | null = null;
function refresh(): Promise<boolean> {
  refreshing ??= fetch(`${BASE}/auth/refresh`, { method: 'POST', headers: CLIENT })
    .then((r) => r.ok, () => false)
    .finally(() => { refreshing = null; });
  return refreshing;
}

interface Opts { method?: string; body?: unknown; headers?: Record<string, string> }

export async function api<T>(path: string, opts: Opts = {}, retried = false): Promise<T> {
  const res = await fetch(BASE + path, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: {
      ...CLIENT,
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...opts.headers,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && !retried && !path.startsWith('/auth/') && (await refresh())) return api<T>(path, opts, true);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? 'ERROR', data?.error?.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}
