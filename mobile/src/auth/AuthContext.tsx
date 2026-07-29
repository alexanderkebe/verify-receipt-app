import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadToken, saveToken, login as apiLogin, logout as apiLogout } from '@/api/session';
import { getMe, type Me } from '@/api/endpoints';
import { onSessionExpired } from '@/api/client';
import { createDebug } from '@/lib/debug';

const debug = createDebug('[AUTH]');

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

  debug('AuthProvider mounted — status:', status, 'user:', user?.email ?? 'null');

  // Restore a stored session on launch
  useEffect(() => {
    let cancelled = false;
    debug('Session restore effect STARTED');
    (async () => {
      try {
        const token = await loadToken();
        debug('Session restore — loadToken result:', token ? '(token found, len=' + token.length + ')' : 'null');

        if (!token) {
          if (!cancelled) {
            debug('Session restore — no token → signedOut');
            setStatus('signedOut');
          }
          return;
        }

        debug('Session restore — calling getMe()...');
        const me = await getMe();
        debug('Session restore — getMe succeeded:', me?.email, 'role:', me?.role);

        if (cancelled) {
          debug('Session restore — cancelled after getMe, discarding');
          return;
        }

        setUser(me);
        setStatus('signedIn');
        debug('Session restore — COMPLETE: signedIn as', me?.email);
      } catch (err) {
        debug('Session restore — ERROR:', (err as Error).message);
        // Token restoration errors must not leave the app on its loading screen.
        if (!cancelled) {
          setUser(null);
          setStatus('signedOut');
          debug('Session restore — fallback to signedOut after error');
        }
      }
    })();
    return () => {
      cancelled = true;
      debug('Session restore effect CLEANUP (cancelled=true)');
    };
  }, []);

  // Any 401 anywhere in the app drops us back to the login screen
  useEffect(
    () =>
      onSessionExpired(() => {
        debug('Session expired event received → reverting to signedOut');
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
        debug('signIn called for', email);
        try {
          const token = await apiLogin(email, password);
          debug('signIn — apiLogin succeeded, saving token...');
          await saveToken(token);
          debug('signIn — token saved, fetching user...');
          const me = await getMe();
          debug('signIn — user fetched:', me?.email, 'mustChangePassword:', me?.mustChangePassword);
          setUser(me);
          setStatus('signedIn');
          debug('signIn — COMPLETE');
        } catch (err) {
          debug('signIn — ERROR:', (err as Error).message);
          throw err;
        }
      },
      async signOut() {
        debug('signOut called');
        await apiLogout();
        setUser(null);
        setStatus('signedOut');
        debug('signOut — COMPLETE');
      },
      async refreshUser() {
        debug('refreshUser called');
        try {
          const me = await getMe();
          debug('refreshUser — fetched:', me?.email, 'mustChangePassword:', me?.mustChangePassword);
          setUser(me);
        } catch (err) {
          debug('refreshUser — ERROR:', (err as Error).message);
        }
      },
    }),
    [status, user],
  );

  debug('AuthProvider render — status:', status, 'user:', user?.email ?? 'null');

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    debug('useAuth called OUTSIDE AuthProvider — throwing error');
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
