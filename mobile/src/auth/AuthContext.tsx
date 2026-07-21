import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadToken, saveToken, login as apiLogin, logout as apiLogout } from '@/api/session';
import { getMe, type Me } from '@/api/endpoints';
import { onSessionExpired } from '@/api/client';

interface AuthState {
  /** null while the stored session is still being restored */
  status: 'loading' | 'signedIn' | 'signedOut';
  user: Me | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-reads /api/me — call after changing the password. */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [user, setUser] = useState<Me | null>(null);

  // Restore a stored session on launch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await loadToken();
      if (!token) {
        if (!cancelled) setStatus('signedOut');
        return;
      }
      try {
        const me = await getMe();
        if (cancelled) return;
        setUser(me);
        setStatus('signedIn');
      } catch {
        // Token rejected/expired — apiFetch already cleared it
        if (!cancelled) setStatus('signedOut');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Any 401 anywhere in the app drops us back to the login screen
  useEffect(
    () =>
      onSessionExpired(() => {
        setUser(null);
        setStatus('signedOut');
      }),
    [],
  );

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      async signIn(email, password) {
        const token = await apiLogin(email, password);
        await saveToken(token);
        const me = await getMe();
        setUser(me);
        setStatus('signedIn');
      },
      async signOut() {
        await apiLogout();
        setUser(null);
        setStatus('signedOut');
      },
      async refreshUser() {
        setUser(await getMe());
      },
    }),
    [status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
