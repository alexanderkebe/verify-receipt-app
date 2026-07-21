// ============================================
// Thin fetch wrapper: base URL, session cookie, unwrapping the backend's
// { success, data | error } envelope, and 401 → session-expired signalling.
// ============================================

import { API_BASE_URL, cookieHeaderFor, loadToken, clearToken } from './session';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Thrown when the session is gone — screens listen for this to bounce to login. */
export class SessionExpiredError extends ApiError {
  constructor() {
    super('Your session has expired. Please sign in again.', 401);
  }
}

type Listener = () => void;
const sessionExpiredListeners = new Set<Listener>();

export function onSessionExpired(listener: Listener): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Verification can take up to ~50s (Telebirr), so this is overridable. */
  timeoutMs?: number;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, timeoutMs = 20_000 } = options;
  const token = await loadToken();

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Cookie: cookieHeaderFor(token) } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = (error as Error)?.name;
    if (name === 'AbortError' || name === 'TimeoutError') {
      throw new ApiError('The request timed out. Please try again.', 408);
    }
    throw new ApiError('Could not reach the server. Check your connection.', 0);
  }

  if (res.status === 401) {
    await clearToken();
    sessionExpiredListeners.forEach((l) => l());
    throw new SessionExpiredError();
  }

  const json = (await res.json().catch(() => null)) as
    | { success: boolean; data?: T; error?: string }
    | null;

  if (!res.ok || !json?.success) {
    throw new ApiError(json?.error ?? 'Something went wrong. Please try again.', res.status);
  }

  return json.data as T;
}
