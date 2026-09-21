import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, setCsrf } from '../../api/client';
interface User {
  username: string;
  csrf: string;
}
const AuthContext = createContext<{
  user: User | null;
  pending: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
} | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['auth'],
    queryFn: async () => {
      const user = await api<User>('/auth/me');
      setCsrf(user.csrf);
      return user;
    },
    retry: false,
    staleTime: 60000,
  });
  useEffect(() => {
    const reset = () => {
      setCsrf('');
      client.setQueryData(['auth'], null);
    };
    window.addEventListener('dtr:unauthorized', reset);
    return () => window.removeEventListener('dtr:unauthorized', reset);
  }, [client]);
  async function login(username: string, password: string) {
    const user = await api<User>('/auth/login', { method: 'POST', body: { username, password } });
    setCsrf(user.csrf);
    client.setQueryData(['auth'], user);
  }
  async function logout() {
    await api('/auth/logout', { method: 'POST', body: {} });
    setCsrf('');
    await client.cancelQueries();
    client.setQueryData(['auth'], null);
    client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
  }
  return (
    <AuthContext.Provider
      value={{ user: query.data ?? null, pending: query.isPending, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider missing');
  return context;
}
