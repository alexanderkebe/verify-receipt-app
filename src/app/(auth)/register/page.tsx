'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from '../auth.module.css';
import { PROVIDER_LABELS, type Provider } from '@/types';

const PROVIDERS = Object.keys(PROVIDER_LABELS) as Provider[];
const MOBILE_MONEY: Provider[] = ['TELEBIRR', 'CBE_BIRR', 'MPESA'];

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

interface FormState {
  businessName: string;
  provider: Provider;
  accountHolderName: string;
  accountNumber: string;
  email: string;
  password: string;
}

const initial: FormState = {
  businessName: '',
  provider: 'CBE',
  accountHolderName: '',
  accountNumber: '',
  email: '',
  password: '',
};

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const isMobileMoney = MOBILE_MONEY.includes(form.provider);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/business/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setError(json.error || 'Registration failed. Please try again.');
        return;
      }
      router.push('/login?registered=1');
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h2 className={styles.formTitle}>Create your account</h2>
      <p className={styles.formSubtitle}>
        Tell us where customers pay you — we&apos;ll verify receipts against it.
      </p>

      {isDemo && (
        <div className="alert mb-4" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '12px 16px', fontSize: 13 }}>
          Demo mode — sign-up is simulated. Use the demo logins on the sign-in page instead.
        </div>
      )}

      {error && (
        <div className="alert alert-danger mb-4" role="alert">
          {error}
        </div>
      )}

      <form className={styles.form} onSubmit={submit}>
        <div className="input-group">
          <label className="input-label">
            Which bank do customers pay you with?<span className="required">*</span>
          </label>
          <select
            className="input-field select-field"
            value={form.provider}
            onChange={(e) => set('provider', e.target.value as Provider)}
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABELS[p]}
              </option>
            ))}
          </select>
        </div>

        <div className="input-group">
          <label className="input-label">
            Account holder name<span className="required">*</span>
          </label>
          <input
            className="input-field"
            value={form.accountHolderName}
            onChange={(e) => set('accountHolderName', e.target.value)}
            placeholder="Name on the account"
            autoComplete="name"
            required
          />
        </div>

        <div className="input-group">
          <label className="input-label">
            {isMobileMoney ? 'Phone number' : 'Account number'}<span className="required">*</span>
          </label>
          <input
            className="input-field"
            value={form.accountNumber}
            onChange={(e) => set('accountNumber', e.target.value)}
            placeholder={isMobileMoney ? '09XXXXXXXX' : '1000XXXXXXXXX'}
            inputMode="numeric"
            required
          />
        </div>

        <div className="input-group">
          <label className="input-label">
            Business name<span className="required">*</span>
          </label>
          <input
            className="input-field"
            value={form.businessName}
            onChange={(e) => set('businessName', e.target.value)}
            placeholder="Addis Coffee House"
            autoComplete="organization"
            required
          />
        </div>

        <div className="input-group">
          <label className="input-label">
            Email<span className="required">*</span>
          </label>
          <input
            type="email"
            className="input-field"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="you@business.et"
            autoComplete="email"
            required
          />
        </div>

        <div className="input-group">
          <label className="input-label">
            Password<span className="required">*</span>
          </label>
          <input
            type="password"
            className="input-field"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>

        <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
          {loading ? <span className="spinner spinner-sm" /> : 'Create account'}
        </button>
      </form>

      <p className={styles.formFooter}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </>
  );
}
