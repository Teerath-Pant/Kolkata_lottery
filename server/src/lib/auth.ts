import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AppError } from './errors';

export type Role = 'user' | 'admin';
interface Claims { sub: string; role: Role; typ: 'access' | 'refresh'; jti?: string; fam?: string }

/**
 * Access token: short-lived and stateless. Refresh token: carries a unique `jti` and a `fam` (family) id; the
 * server keeps the jti in refresh_tokens so each one can be used once and revoked (see services/sessions.ts).
 */
export function signTokens(user: { id: number; role: Role }, familyId: string = randomUUID()) {
  const base = { sub: String(user.id), role: user.role };
  const jti = randomUUID();
  const refreshToken = jwt.sign({ ...base, typ: 'refresh', fam: familyId }, config.JWT_REFRESH_SECRET, { expiresIn: config.REFRESH_TTL as any, jwtid: jti });
  const { exp } = jwt.decode(refreshToken) as { exp: number };
  return {
    accessToken: jwt.sign({ ...base, typ: 'access' }, config.JWT_ACCESS_SECRET, { expiresIn: config.ACCESS_TTL as any }),
    refreshToken,
    refresh: { jti, familyId, expiresAt: new Date(exp * 1000) },
  };
}

export function verifyToken(token: string, typ: 'access' | 'refresh') {
  try {
    const c = jwt.verify(token, typ === 'access' ? config.JWT_ACCESS_SECRET : config.JWT_REFRESH_SECRET, { algorithms: ['HS256'] }) as unknown as Claims;
    if (c.typ !== typ) throw new Error('wrong token type');
    if (typ === 'refresh' && (!c.jti || !c.fam)) throw new Error('refresh token without id');
    return { id: Number(c.sub), role: c.role, jti: c.jti!, fam: c.fam! };
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired token');
  }
}
