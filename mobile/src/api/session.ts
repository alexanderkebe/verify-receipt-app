// ============================================
// Session storage + NextAuth credentials login
//
// The backend issues a 30-day JWT in the `authjs.session-token` cookie
// (see src/auth.config.ts). A native client can obtain it by driving the
// same credentials flow the browser uses, then replay it as a Cookie header
// on every request.
// ============================================

import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { createDebug } from '@/lib/debug';

const TOKEN_KEY = 'session-token';

const debug = createDebug('[SESSION]');

export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL ||
  ((Constants.expoConfig?.extra?.apiBaseUrl as string) ??
    'https://verify-receipt-app.vercel.app');


// NextAuth prefixes the cookie with __Secure- when served over HTTPS.
const SESSION_COOKIE_NAMES = ['__Secure-authjs.session-token', 'authjs.session-token'];
const CSRF_COOKIE_NAMES = ['__Host-authjs.csrf-token', 'authjs.csrf-token'];

let cachedToken: string | null = null;

function webStorage(): Storage | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // Storage can be disabled by browser privacy settings.
    return null;
  }
}

export async function loadToken(): Promise<string | null> {
  if (cachedToken) {
    debug('loadToken → from cache (present)');
    return cachedToken;
  }
  const storage = webStorage();
  debug(`loadToken → storage=${!!storage}, OS=${Platform.OS}`);
  try {
    cachedToken = storage
      ? storage.getItem(TOKEN_KEY)
      : Platform.OS === 'web'
        ? null
        : await SecureStore.getItemAsync(TOKEN_KEY);
    debug(`loadToken → result=${cachedToken ? '(token present, length=' + cachedToken.length + ')' : 'null'}`);
  } catch (err) {
    debug('loadToken → ERROR:', (err as Error).message);
    cachedToken = null;
  }
  return cachedToken;
}

export async function saveToken(token: string): Promise<void> {
  debug('saveToken → length=' + token.length + ', first 20 chars=' + token.substring(0, 20) + '...');
  cachedToken = token;
  const storage = webStorage();
  try {
    if (storage) {
      storage.setItem(TOKEN_KEY, token);
      debug('saveToken → stored in web localStorage');
    } else if (Platform.OS !== 'web') {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      debug('saveToken → stored in SecureStore');
    }
  } catch (err) {
    debug('saveToken → ERROR:', (err as Error).message);
  }
}

export async function clearToken(): Promise<void> {
  debug('clearToken');
  cachedToken = null;
  const storage = webStorage();
  try {
    if (storage) {
      storage.removeItem(TOKEN_KEY);
      debug('clearToken → removed from web localStorage');
    } else if (Platform.OS !== 'web') {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      debug('clearToken → removed from SecureStore');
    }
  } catch (err) {
    debug('clearToken → ERROR:', (err as Error).message);
  }
}

/** Pull a cookie value out of one or more Set-Cookie header strings. */
function readCookie(setCookie: string | null, names: string[]): string | null {
  if (!setCookie) {
    debug('readCookie → no Set-Cookie header');
    return null;
  }
  debug('readCookie → raw header (first 200 chars):', setCookie.substring(0, 200));
  for (const name of names) {
    // Set-Cookie headers may be comma-joined by fetch; match each name directly.
    const match = setCookie.match(new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;,]+)`));
    if (match?.[1]) {
      debug('readCookie → found', name, '=', match[1].substring(0, 20) + '...');
      return decodeURIComponent(match[1]);
    }
  }
  debug('readCookie → none of the names matched:', names);
  return null;
}

export class LoginError extends Error {}

/**
 * Sign in with email + password against NextAuth's credentials provider.
 * Returns the session token; the caller persists it via saveToken().
 */
export async function login(email: string, password: string): Promise<string> {
  debug('login → starting for email=', email);

  // 1. Fetch a CSRF token (NextAuth requires it on the callback POST)
  debug('login → Step 1: fetching CSRF token from', `${API_BASE_URL}/api/auth/csrf`);
  const csrfRes = await fetch(`${API_BASE_URL}/api/auth/csrf`, {
    headers: { Accept: 'application/json' },
  });
  if (!csrfRes.ok) {
    debug('login → CSRF request failed: status=' + csrfRes.status);
    throw new LoginError('Could not reach the server. Check your connection.');
  }
  debug('login → CSRF response status=' + csrfRes.status);
  const csrfJson = (await csrfRes.json()) as { csrfToken: string };
  debug('login → CSRF token received:', csrfJson.csrfToken?.substring(0, 20) + '...');
  const csrfCookie = readCookie(csrfRes.headers.get('set-cookie'), CSRF_COOKIE_NAMES);
  debug('login → CSRF cookie found:', !!csrfCookie);

  // 2. Post credentials. redirect=false makes NextAuth answer with JSON
  //    instead of a 302, and the session cookie arrives in Set-Cookie.
  const body = new URLSearchParams({
    email: email.trim().toLowerCase(),
    password,
    csrfToken: csrfJson.csrfToken,
    redirect: 'false',
    callbackUrl: `${API_BASE_URL}/dashboard`,
  });

  const cookieHeader = csrfCookie
    ? `${CSRF_COOKIE_NAMES[0]}=${encodeURIComponent(csrfCookie)}; ${CSRF_COOKIE_NAMES[1]}=${encodeURIComponent(csrfCookie)}`
    : '';

  debug('login → Step 2: posting credentials to', `${API_BASE_URL}/api/auth/callback/credentials`);
  debug('login → cookieHeader present:', !!cookieHeader);

  const res = await fetch(`${API_BASE_URL}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: body.toString(),
    redirect: 'manual',
  });

  debug('login → callback response status=' + res.status);
  debug('login → callback response headers:', JSON.stringify([...(res.headers as any).entries()]));

  const token = readCookie(res.headers.get('set-cookie'), SESSION_COOKIE_NAMES);
  if (token) {
    debug('login → SUCCESS - session token acquired');
    return token;
  }

  // No session cookie → NextAuth rejected the credentials. It signals the
  // reason through an `error` query param on the redirect location or in JSON.
  const location = res.headers.get('location') ?? '';
  const payload = await res.text().catch(() => '');
  debug('login → FAILED - no session cookie. location=', location.substring(0, 200), 'payload=', payload.substring(0, 200));
  const reason = /error=([^&]+)/.exec(location)?.[1] ?? /error=([^&"]+)/.exec(payload)?.[1];
  if (reason && !/CredentialsSignin/i.test(reason)) {
    debug('login → extracted error reason:', reason);
    throw new LoginError(decodeURIComponent(reason.replace(/\+/g, ' ')));
  }
  debug('login → fallback: wrong email or password');
  throw new LoginError('Wrong email or password.');
}

export async function logout(): Promise<void> {
  debug('logout');
  await clearToken();
}

/** The Cookie header value to send with authenticated requests. */
export function cookieHeaderFor(token: string): string {
  return SESSION_COOKIE_NAMES.map((n) => `${n}=${token}`).join('; ');
}

