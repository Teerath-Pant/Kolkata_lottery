import { createContext, ReactNode, useContext } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { User } from './types';

interface AuthCtx {
  user: User | null;
  balance: number;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (b: { username: string; name: string; phone: string; password: string; referralCode: string }) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>(null as never);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  // The session lives in httpOnly cookies, so JS can't tell if we're logged in: ask the server. A 401 means logged out.
  const fetchMe = () => api<{ user: User; balance: number }>('/me');
  const me = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    retry: false,
    refetchInterval: (q) => (q.state.data ? 15_000 : false),
  });

  // the login/register response already set the cookies, so just load the profile
  const afterAuth = () => qc.fetchQuery({ queryKey: ['me'], queryFn: fetchMe, staleTime: 0 });

  const value: AuthCtx = {
    user: me.data?.user ?? null,
    balance: me.data?.balance ?? 0,
    loading: me.isLoading,
    login: async (username, password) => { await api('/auth/login', { body: { username, password } }); await afterAuth(); },
    register: async (b) => { await api('/auth/register', { body: b }); await afterAuth(); },
    logout: () => { api('/auth/logout', { method: 'POST' }).catch(() => undefined).finally(() => { qc.clear(); window.location.assign('/login'); }); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
