'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from '../auth.module.css';
import PasswordField from '@/components/auth/PasswordField';

interface ResetPasswordResponse {
  success: boolean;
  error?: string;
}

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword, confirmPassword }),
      });
      const result = (await response.json()) as ResetPasswordResponse;
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to reset your password.');
      router.replace('/login?reset=1');
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to reset your password.');
    } finally {
      setLoading(false);
    }
  }

  if (token.length !== 64) {
    return (
      <>
        <h2 className={styles.formTitle}>Invalid reset link</h2>
        <p className={styles.formSubtitle}>This password reset link is incomplete or invalid.</p>
        <Link className="btn btn-primary btn-lg w-full" href="/forgot-password">Request a new link</Link>
        <p className={styles.formFooter}><Link href="/login">Back to sign in</Link></p>
      </>
    );
  }

  return (
    <>
      <h2 className={styles.formTitle}>Choose a new password</h2>
      <p className={styles.formSubtitle}>Use at least 8 characters. The reset link can only be used once.</p>

      {error && <div className="alert alert-danger mb-4" role="alert">{error}</div>}

      <form id="reset-password-form" name="reset-password" method="post" className={styles.form} onSubmit={onSubmit}>
        <PasswordField
          id="new-password"
          name="newPassword"
          label="New password"
          value={newPassword}
          onChange={setNewPassword}
          autoComplete="new-password"
          minLength={8}
          description="Use at least 8 characters."
          autoFocus
          required
        />
        <PasswordField
          id="confirm-password"
          name="confirmPassword"
          label="Confirm password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          minLength={8}
          required
        />
        <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
          {loading ? <span className="spinner spinner-sm" /> : 'Update password'}
        </button>
      </form>

      <p className={styles.formFooter}><Link href="/login">Back to sign in</Link></p>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="spinner spinner-lg" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
