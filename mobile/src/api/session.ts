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

const TOKEN_KEY = 'session-token';

export const API_BASE_URL: string =
  (Constants.expoConfig?.extra?.apiBaseUrl as string) ?? 'https://verify-receipt-app.vercel.app';

// NextAuth prefixes the cookie with __Secure- when served over HTTPS.
const SESSION_COOKIE_NAMES = ['__Secure-authjs.session-token', 'authjs.session-token'];
const CSRF_COOKIE_NAMES = ['__Host-authjs.csrf-token', 'authjs.csrf-token'];

let cachedToken: string | null = null;

export async function loadToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  return cachedToken;
}

export async function saveToken(token: string): Promise<void> {
  cachedToken = token;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  cachedToken = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

/** Pull a cookie value out of one or more Set-Cookie header strings. */
function readCookie(setCookie: string | null, names: string[]): string | null {
  if (!setCookie) return null;
  for (const name of names) {
    // Set-Cookie headers may be comma-joined by fetch; match each name directly.
    const match = setCookie.match(new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;,]+)`));
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return null;
}

export class LoginError extends Error {}

/**
 * Sign in with email + password against NextAuth's credentials provider.
 * Returns the session token; the caller persists it via saveToken().
 */
export async function login(email: string, password: string): Promise<string> {
  // 1. Fetch a CSRF token (NextAuth requires it on the callback POST)
  const csrfRes = await fetch(`${API_BASE_URL}/api/auth/csrf`, {
    headers: { Accept: 'application/json' },
  });
  if (!csrfRes.ok) throw new LoginError('Could not reach the server. Check your connection.');
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const csrfCookie = readCookie(csrfRes.headers.get('set-cookie'), CSRF_COOKIE_NAMES);

  // 2. Post credentials. redirect=false makes NextAuth answer with JSON
  //    instead of a 302, and the session cookie arrives in Set-Cookie.
  const body = new URLSearchParams({
    email: email.trim().toLowerCase(),
    password,
    csrfToken,
    redirect: 'false',
    callbackUrl: `${API_BASE_URL}/dashboard`,
  });

  const cookieHeader = csrfCookie
    ? `${CSRF_COOKIE_NAMES[0]}=${encodeURIComponent(csrfCookie)}; ${CSRF_COOKIE_NAMES[1]}=${encodeURIComponent(csrfCookie)}`
    : '';

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

  const token = readCookie(res.headers.get('set-cookie'), SESSION_COOKIE_NAMES);
  if (token) return token;

  // No session cookie → NextAuth rejected the credentials. It signals the
  // reason through an `error` query param on the redirect location or in JSON.
  const location = res.headers.get('location') ?? '';
  const payload = await res.text().catch(() => '');
  const reason = /error=([^&]+)/.exec(location)?.[1] ?? /error=([^&"]+)/.exec(payload)?.[1];
  if (reason && !/CredentialsSignin/i.test(reason)) {
    throw new LoginError(decodeURIComponent(reason.replace(/\+/g, ' ')));
  }
  throw new LoginError('Wrong email or password.');
}

export async function logout(): Promise<void> {
  await clearToken();
}

/** The Cookie header value to send with authenticated requests. */
export function cookieHeaderFor(token: string): string {
  return SESSION_COOKIE_NAMES.map((n) => `${n}=${token}`).join('; ');
}
