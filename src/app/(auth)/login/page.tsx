'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import styles from '../auth.module.css';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (!res || res.error) {
      setError('Invalid email or password.');
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <>
      <h2 className={styles.formTitle}>Welcome back</h2>
      <p className={styles.formSubtitle}>Sign in to your business dashboard.</p>

      {error && (
        <div className="alert alert-danger mb-4" role="alert">
          {error}
        </div>
      )}

      <form className={styles.form} onSubmit={onSubmit}>
        <div className="input-group">
          <label className="input-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="input-field"
            placeholder="you@business.et"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <div className="input-group">
          <div className="flex items-center justify-between">
            <label className="input-label" htmlFor="password">
              Password
            </label>
            <Link href="/forgot-password" className="text-xs">
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            className="input-field"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
          {loading ? <span className="spinner spinner-sm" /> : 'Sign in'}
        </button>
      </form>

      <p className={styles.formFooter}>
        Don&apos;t have an account? <Link href="/register">Create one</Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="spinner spinner-lg" />}>
      <LoginForm />
    </Suspense>
  );
}
