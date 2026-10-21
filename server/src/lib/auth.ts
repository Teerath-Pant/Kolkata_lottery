import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AppError } from './errors';

export type Role = 'user' | 'admin';
interface Claims { sub: string; role: Role; typ: 'access' | 'refresh' }

export function signTokens(user: { id: number; role: Role }) {
  const base = { sub: String(user.id), role: user.role };
  return {
    accessToken: jwt.sign({ ...base, typ: 'access' }, config.JWT_ACCESS_SECRET, { expiresIn: config.ACCESS_TTL as any }),
    refreshToken: jwt.sign({ ...base, typ: 'refresh' }, config.JWT_REFRESH_SECRET, { expiresIn: config.REFRESH_TTL as any }),
  };
}

export function verifyToken(token: string, typ: 'access' | 'refresh') {
  try {
    const c = jwt.verify(token, typ === 'access' ? config.JWT_ACCESS_SECRET : config.JWT_REFRESH_SECRET) as unknown as Claims;
    if (c.typ !== typ) throw new Error('wrong token type');
    return { id: Number(c.sub), role: c.role };
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired token');
  }
}
