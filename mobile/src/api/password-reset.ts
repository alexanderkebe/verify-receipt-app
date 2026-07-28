import { apiFetch } from './client';

export interface PasswordResetRequestResult {
  message: string;
}

/**
 * Request a reset email through the same public endpoint used by the web app.
 * The server deliberately returns the same message for known and unknown
 * addresses so the client cannot be used to enumerate accounts.
 */
export function requestPasswordReset(email: string): Promise<PasswordResetRequestResult> {
  return apiFetch<PasswordResetRequestResult>('/api/auth/forgot-password', {
    method: 'POST',
    body: { email: email.trim().toLowerCase() },
  });
}
