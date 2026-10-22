import { createContext, ReactNode, useContext } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
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
  // The session lives in httpOnly cookies, so JS can't tell if we're logged in: ask the server. A 401 means logged out.
  const fetchMe = () => api<{ user: AdminUserInfo }>('/me');
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false });
  const user = me.data?.user ?? null;
  const logoutRequest = () => api('/auth/logout', { method: 'POST' }).catch(() => undefined);

  const value: AuthCtx = {
    admin: user?.role === 'admin' ? user : null,
    loading: me.isLoading,
    login: async (mobile, password) => {
      const r = await api<{ user: AdminUserInfo }>('/auth/login', { body: { mobile, password } });
      if (r.user.role !== 'admin') { await logoutRequest(); throw new Error('This account is not an admin'); }
      await qc.fetchQuery({ queryKey: ['me'], queryFn: fetchMe, staleTime: 0 });
    },
    logout: () => { logoutRequest().finally(() => { qc.clear(); window.location.assign(import.meta.env.BASE_URL + 'login'); }); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
