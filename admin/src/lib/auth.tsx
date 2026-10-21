import { createContext, ReactNode, useContext, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, tokens } from './api';
import type { AdminUserInfo } from './types';

interface AuthCtx {
  admin: AdminUserInfo | null;
  loading: boolean;
  login: (mobile: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>(null as never);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [authed, setAuthed] = useState(() => !!tokens.get());
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ user: AdminUserInfo }>('/me'),
    enabled: authed,
    retry: false,
  });
  const user = authed ? me.data?.user ?? null : null;

  const value: AuthCtx = {
    admin: user?.role === 'admin' ? user : null,
    loading: authed && me.isLoading,
    login: async (mobile, password) => {
      const r = await api<{ user: AdminUserInfo; accessToken: string; refreshToken: string }>('/auth/login', { body: { mobile, password } });
      if (r.user.role !== 'admin') throw new Error('This account is not an admin');
      tokens.set(r);
      setAuthed(true);
      await qc.fetchQuery({ queryKey: ['me'], queryFn: () => api<{ user: AdminUserInfo }>('/me'), staleTime: 0 });
    },
    logout: () => { tokens.clear(); qc.clear(); window.location.assign(import.meta.env.BASE_URL + 'login'); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
