'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from '../auth.module.css';
import { PROVIDER_LABELS, type Provider } from '@/types';

const PROVIDERS = Object.keys(PROVIDER_LABELS) as Provider[];

interface FormState {
  legalName: string;
  tradingName: string;
  businessType: string;
  sector: string;
  phone: string;
  email: string;
  city: string;
  region: string;
  provider: Provider;
  accountHolderName: string;
  accountNumber: string;
  suffix: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  tosAccepted: boolean;
}

const initial: FormState = {
  legalName: '',
  tradingName: '',
  businessType: 'Retail',
  sector: '',
  phone: '',
  email: '',
  city: '',
  region: '',
  provider: 'CBE',
  accountHolderName: '',
  accountNumber: '',
  suffix: '',
  ownerName: '',
  ownerEmail: '',
  ownerPassword: '',
  tosAccepted: false,
};

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function next() {
    setError(null);
    if (step === 1 && (!form.legalName || !form.businessType || !form.phone || !form.email)) {
      setError('Please fill in all required business fields.');
      return;
    }
    if (step === 2 && (!form.accountHolderName || !form.accountNumber)) {
      setError('Please provide your payment account details.');
      return;
    }
    setStep((s) => Math.min(3, s + 1));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.tosAccepted) {
      setError('You must accept the terms of service.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/business/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legalName: form.legalName,
          tradingName: form.tradingName || undefined,
          businessType: form.businessType,
          sector: form.sector || undefined,
          phone: form.phone,
          email: form.email,
          city: form.city || undefined,
          region: form.region || undefined,
          account: {
            provider: form.provider,
            accountHolderName: form.accountHolderName,
            accountNumber: form.accountNumber,
            suffix: form.suffix || undefined,
          },
          ownerName: form.ownerName,
          ownerEmail: form.ownerEmail,
          ownerPassword: form.ownerPassword,
          tosAccepted: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setError(json.error || 'Registration failed. Please try again.');
        return;
      }
      if (isDemo) {
        setSuccess(true);
      } else {
        router.push('/login?registered=1');
      }
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <>
        <h2 className={styles.formTitle}>Account created!</h2>
        <p className={styles.formSubtitle}>Your business account is ready to use.</p>
        <div className="alert mb-4" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '16px', fontSize: 13 }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>Sign in with these demo credentials</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ opacity: 0.7 }}>Email</span>
              <span style={{ fontFamily: 'monospace' }}>any email address</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ opacity: 0.7 }}>Password</span>
              <span style={{ fontFamily: 'monospace' }}>demo123</span>
            </div>
          </div>
        </div>
        <button className="btn btn-primary w-full" onClick={() => router.push('/login')}>
          Go to sign in
        </button>
      </>
    );
  }

  return (
    <>
      <h2 className={styles.formTitle}>Create your business account</h2>
      <p className={styles.formSubtitle}>Step {step} of 3 — it takes about two minutes.</p>

      <div className={styles.steps}>
        {[1, 2, 3].map((s) => (
          <div key={s} className={`${styles.step} ${s <= step ? styles.stepActive : ''}`} />
        ))}
      </div>

      {error && (
        <div className="alert alert-danger mb-4" role="alert">
          {error}
        </div>
      )}

      <form className={styles.form} onSubmit={submit}>
        {step === 1 && (
          <>
            <div className="input-group">
              <label className="input-label">
                Legal business name<span className="required">*</span>
              </label>
              <input
                className="input-field"
                value={form.legalName}
                onChange={(e) => set('legalName', e.target.value)}
                placeholder="Addis Coffee House PLC"
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">Trading name</label>
              <input
                className="input-field"
                value={form.tradingName}
                onChange={(e) => set('tradingName', e.target.value)}
                placeholder="Addis Coffee House"
              />
            </div>
            <div className={styles.formRow}>
              <div className="input-group">
                <label className="input-label">
                  Business type<span className="required">*</span>
                </label>
                <select
                  className="input-field select-field"
                  value={form.businessType}
                  onChange={(e) => set('businessType', e.target.value)}
                >
                  {['Retail', 'Restaurant', 'Service', 'Wholesale', 'Online', 'Other'].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Sector</label>
                <input
                  className="input-field"
                  value={form.sector}
                  onChange={(e) => set('sector', e.target.value)}
                  placeholder="Food &amp; Beverage"
                />
              </div>
            </div>
            <div className={styles.formRow}>
              <div className="input-group">
                <label className="input-label">
                  Business phone<span className="required">*</span>
                </label>
                <input
                  className="input-field"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  placeholder="+251911000000"
                  required
                />
              </div>
              <div className="input-group">
                <label className="input-label">
                  Business email<span className="required">*</span>
                </label>
                <input
                  type="email"
                  className="input-field"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="info@business.et"
                  required
                />
              </div>
            </div>
            <div className={styles.formRow}>
              <div className="input-group">
                <label className="input-label">City</label>
                <input className="input-field" value={form.city} onChange={(e) => set('city', e.target.value)} />
              </div>
              <div className="input-group">
                <label className="input-label">Region</label>
                <input className="input-field" value={form.region} onChange={(e) => set('region', e.target.value)} />
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-sm text-secondary">
              Add the account customers pay into. We&apos;ll match receipts against it.
            </p>
            <div className="input-group">
              <label className="input-label">
                Provider<span className="required">*</span>
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
                required
              />
            </div>
            <div className={styles.formRow}>
              <div className="input-group">
                <label className="input-label">
                  Account / phone number<span className="required">*</span>
                </label>
                <input
                  className="input-field"
                  value={form.accountNumber}
                  onChange={(e) => set('accountNumber', e.target.value)}
                  required
                />
              </div>
              <div className="input-group">
                <label className="input-label">Suffix (if applicable)</label>
                <input
                  className="input-field"
                  value={form.suffix}
                  onChange={(e) => set('suffix', e.target.value)}
                  placeholder="8-digit for CBE"
                />
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <p className="text-sm text-secondary">Create the owner login for this business.</p>
            <div className="input-group">
              <label className="input-label">
                Your full name<span className="required">*</span>
              </label>
              <input
                className="input-field"
                value={form.ownerName}
                onChange={(e) => set('ownerName', e.target.value)}
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">
                Your email<span className="required">*</span>
              </label>
              <input
                type="email"
                className="input-field"
                value={form.ownerEmail}
                onChange={(e) => set('ownerEmail', e.target.value)}
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
                value={form.ownerPassword}
                onChange={(e) => set('ownerPassword', e.target.value)}
                placeholder="At least 8 characters"
                required
              />
            </div>
            <label className="flex items-start gap-2 text-sm text-secondary">
              <input
                type="checkbox"
                checked={form.tosAccepted}
                onChange={(e) => set('tosAccepted', e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span>I accept the Terms of Service and Privacy Policy.</span>
            </label>
          </>
        )}

        <div className="flex gap-3">
          {step > 1 && (
            <button type="button" className="btn btn-secondary" onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          )}
          {step < 3 ? (
            <button type="button" className="btn btn-primary w-full" onClick={next}>
              Continue
            </button>
          ) : (
            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? <span className="spinner spinner-sm" /> : 'Create account'}
            </button>
          )}
        </div>
      </form>

      <p className={styles.formFooter}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </>
  );
}
