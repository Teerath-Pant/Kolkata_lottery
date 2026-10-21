import { createContext, ReactNode, useCallback, useContext, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, tokens } from './api';
import type { User } from './types';

interface AuthCtx {
  user: User | null;
  balance: number;
  loading: boolean;
  login: (mobile: string, password: string) => Promise<void>;
  register: (mobile: string, name: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>(null as never);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  // state (not just localStorage) so the `me` query switches on as soon as a login stores tokens
  const [authed, setAuthed] = useState(() => !!tokens.get());
  const fetchMe = () => api<{ user: User; balance: number }>('/me');
  const me = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    enabled: authed,
    retry: false,
    refetchInterval: 15_000,
  });

  const afterAuth = useCallback(async (r: { accessToken: string; refreshToken: string }) => {
    tokens.set(r);
    setAuthed(true);
    await qc.fetchQuery({ queryKey: ['me'], queryFn: () => api<{ user: User; balance: number }>('/me'), staleTime: 0 });
  }, [qc]);

  const value: AuthCtx = {
    user: authed ? me.data?.user ?? null : null,
    balance: me.data?.balance ?? 0,
    loading: authed && me.isLoading,
    login: async (mobile, password) => afterAuth(await api('/auth/login', { body: { mobile, password } })),
    register: async (mobile, name, password) => afterAuth(await api('/auth/register', { body: { mobile, name, password } })),
    logout: () => { tokens.clear(); qc.clear(); window.location.assign('/login'); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
