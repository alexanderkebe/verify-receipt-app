'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from '../auth.module.css';

interface ForgotPasswordResponse {
  success: boolean;
  data?: { message: string; devResetUrl?: string };
  error?: string;
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    setDevResetUrl(null);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const result = (await response.json()) as ForgotPasswordResponse;
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to request a reset link.');
      setMessage(result.data?.message || 'Check your email for a password reset link.');
      setDevResetUrl(result.data?.devResetUrl || null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to request a reset link.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h2 className={styles.formTitle}>Reset your password</h2>
      <p className={styles.formSubtitle}>
        Enter your account email and we&apos;ll send you a secure reset link.
      </p>

      {message && <div className="alert alert-success mb-4" role="status">{message}</div>}
      {error && <div className="alert alert-danger mb-4" role="alert">{error}</div>}

      {devResetUrl && (
        <div className="alert mb-4" role="status">
          Email is not configured in development. <Link href={devResetUrl}>Open the test reset link</Link>.
        </div>
      )}

      {!message && (
        <form id="forgot-password-form" name="forgot-password" method="post" className={styles.form} onSubmit={onSubmit}>
          <div className="input-group">
            <label className="input-label" htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              className="input-field"
              placeholder="you@business.et"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              required
            />
          </div>
          <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
            {loading ? <span className="spinner spinner-sm" /> : 'Send reset link'}
          </button>
        </form>
      )}

      <p className={styles.formFooter}><Link href="/login">Back to sign in</Link></p>
    </>
  );
}
