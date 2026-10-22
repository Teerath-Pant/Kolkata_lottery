import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AppError } from './errors';

// user app and admin app share the host (cookies ignore ports), so each gets its own cookie names.
// Browser apps identify themselves with an `X-Client: user|admin` header.
const names = (req: Request) => (req.get('x-client') === 'admin' ? { at: 'admin_at', rt: 'admin_rt' } : { at: 'at', rt: 'rt' });

// refresh token is only ever sent to the auth endpoints
const PATHS = { at: '/api/v1', rt: '/api/v1/auth' } as const;

const base = { httpOnly: true, sameSite: 'lax' as const, secure: config.NODE_ENV === 'production' };

function readCookie(req: Request, name: string) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

export const cookieToken = (req: Request, kind: 'at' | 'rt') => readCookie(req, names(req)[kind]);

export function setAuthCookies(req: Request, res: Response, t: { accessToken: string; refreshToken: string }) {
  const n = names(req);
  for (const [kind, token] of [['at', t.accessToken], ['rt', t.refreshToken]] as const) {
    const exp = (jwt.decode(token) as { exp: number }).exp * 1000; // cookie lives exactly as long as the token
    res.cookie(n[kind], token, { ...base, path: PATHS[kind], maxAge: Math.max(0, exp - Date.now()) });
  }
}

export function clearAuthCookies(req: Request, res: Response) {
  const n = names(req);
  res.clearCookie(n.at, { ...base, path: PATHS.at });
  res.clearCookie(n.rt, { ...base, path: PATHS.rt });
}

/**
 * CSRF guard for cookie-authenticated writes: a custom header cannot be sent cross-site without a
 * CORS preflight, which the origin allowlist rejects. (Cookies are also SameSite=Lax.)
 */
export function assertSameClient(req: Request) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.get('x-client')) {
    throw new AppError(403, 'CSRF', 'Missing X-Client header');
  }
}
