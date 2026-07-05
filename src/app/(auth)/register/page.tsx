'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import styles from '../auth.module.css';
import { PROVIDER_LABELS, type Provider } from '@/types';

const PROVIDERS = Object.keys(PROVIDER_LABELS) as Provider[];
const MOBILE_MONEY: Provider[] = ['TELEBIRR', 'CBE_BIRR', 'MPESA'];

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
const SOCIALS = [
  { id: 'google', label: 'Google', enabled: process.env.NEXT_PUBLIC_AUTH_GOOGLE === 'true' },
  { id: 'facebook', label: 'Meta', enabled: process.env.NEXT_PUBLIC_AUTH_FACEBOOK === 'true' },
  { id: 'apple', label: 'Apple', enabled: process.env.NEXT_PUBLIC_AUTH_APPLE === 'true' },
].filter((s) => s.enabled);

interface AccountEntry {
  provider: Provider;
  accountHolderName: string;
  accountNumber: string;
}

interface BusinessHit {
  id: string;
  name: string;
  city: string | null;
}

function SocialButtons() {
  if (SOCIALS.length === 0) return null;
  return (
    <>
      <div className="flex gap-3 mb-4">
        {SOCIALS.map((s) => (
          <button
            key={s.id}
            type="button"
            className="btn btn-secondary w-full"
            onClick={() => signIn(s.id, { callbackUrl: '/dashboard' })}
          >
            Continue with {s.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 mb-4 text-xs text-muted">
        <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
        or
        <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
      </div>
    </>
  );
}

function RegisterContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [flow, setFlow] = useState<'business' | 'join'>(params.get('join') ? 'join' : 'business');
  const ssoNew = params.get('sso') === 'new';

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ── Create business ──
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessPassword, setBusinessPassword] = useState('');
  const [accounts, setAccounts] = useState<AccountEntry[]>([]);

  function toggleProvider(p: Provider) {
    setAccounts((prev) =>
      prev.some((a) => a.provider === p)
        ? prev.filter((a) => a.provider !== p)
        : [...prev, { provider: p, accountHolderName: '', accountNumber: '' }],
    );
  }

  function setAccountField(p: Provider, field: 'accountHolderName' | 'accountNumber', value: string) {
    setAccounts((prev) => prev.map((a) => (a.provider === p ? { ...a, [field]: value } : a)));
  }

  async function submitBusiness(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (accounts.length === 0) {
      setError('Select at least one payment provider your customers pay you with.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/business/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName,
          ownerName,
          email,
          password,
          businessPassword,
          accounts: accounts.map((a) => ({
            ...a,
            accountHolderName: a.accountHolderName || businessName,
          })),
        }),
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

  // ── Join business ──
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<BusinessHit[]>([]);
  const [selected, setSelected] = useState<BusinessHit | null>(null);
  const [joinPassword, setJoinPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [joinEmail, setJoinEmail] = useState('');
  const [joinUserPassword, setJoinUserPassword] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (selected || !query.trim()) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/business/search?q=${encodeURIComponent(query.trim())}`);
        const json = await res.json();
        setHits(json.success ? json.data : []);
      } catch {
        setHits([]);
      }
    }, 200);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, selected]);

  async function submitJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selected) {
      setError('Search and select your business from the list.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/business/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: selected.id,
          businessPassword: joinPassword,
          fullName,
          email: joinEmail,
          password: joinUserPassword,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setError(json.error || 'Could not join. Please try again.');
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
      <h2 className={styles.formTitle}>{flow === 'business' ? 'Create your business' : 'Join your team'}</h2>
      <p className={styles.formSubtitle}>
        {flow === 'business'
          ? 'Register your business and every account customers pay you with.'
          : 'Find your business and sign up with its business password.'}
      </p>

      <div className="tabs">
        <button type="button" className={`tab ${flow === 'business' ? 'active' : ''}`} onClick={() => setFlow('business')}>
          Register a business
        </button>
        <button type="button" className={`tab ${flow === 'join' ? 'active' : ''}`} onClick={() => setFlow('join')}>
          Join a business
        </button>
      </div>

      {ssoNew && (
        <div className="alert alert-warning mb-4">
          No account exists for that social login yet — create one below first, then use the social button to sign in.
        </div>
      )}
      {isDemo && (
        <div className="alert mb-4" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '12px 16px', fontSize: 13 }}>
          Demo mode — sign-up is simulated. Use the demo logins on the sign-in page instead.
        </div>
      )}
      {error && <div className="alert alert-danger mb-4" role="alert">{error}</div>}

      {flow === 'business' ? (
        <form className={styles.form} onSubmit={submitBusiness}>
          <div className="input-group">
            <label className="input-label">Business name<span className="required">*</span></label>
            <input className="input-field" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Addis Coffee House" autoComplete="organization" required />
          </div>

          <div className="input-group">
            <label className="input-label">Which accounts do customers pay you with?<span className="required">*</span></label>
            <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
              {PROVIDERS.map((p) => {
                const on = accounts.some((a) => a.provider === p);
                return (
                  <button
                    key={p}
                    type="button"
                    className={`btn ${on ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '8px 14px', fontSize: 13 }}
                    onClick={() => toggleProvider(p)}
                  >
                    {on ? '✓ ' : ''}{PROVIDER_LABELS[p]}
                  </button>
                );
              })}
            </div>
            <span className="input-help">Select all that apply — receipts are matched against these accounts.</span>
          </div>

          {accounts.map((a) => (
            <div key={a.provider} className="card" style={{ padding: '14px 16px' }}>
              <div className="text-sm font-medium mb-2" style={{ color: 'var(--color-accent)' }}>
                {PROVIDER_LABELS[a.provider]}
              </div>
              <div className={styles.formRow}>
                <div className="input-group">
                  <label className="input-label">Account holder name</label>
                  <input
                    className="input-field"
                    value={a.accountHolderName}
                    onChange={(e) => setAccountField(a.provider, 'accountHolderName', e.target.value)}
                    placeholder={businessName || 'Name on the account'}
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">
                    {MOBILE_MONEY.includes(a.provider) ? 'Phone number' : 'Account number'}<span className="required">*</span>
                  </label>
                  <input
                    className="input-field"
                    value={a.accountNumber}
                    onChange={(e) => setAccountField(a.provider, 'accountNumber', e.target.value)}
                    placeholder={MOBILE_MONEY.includes(a.provider) ? '09XXXXXXXX' : '1000XXXXXXXXX'}
                    inputMode="numeric"
                    required
                  />
                </div>
              </div>
            </div>
          ))}

          <div className={styles.formRow}>
            <div className="input-group">
              <label className="input-label">Your full name<span className="required">*</span></label>
              <input className="input-field" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} autoComplete="name" required />
            </div>
            <div className="input-group">
              <label className="input-label">Email<span className="required">*</span></label>
              <input type="email" className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </div>
          </div>

          <div className={styles.formRow}>
            <div className="input-group">
              <label className="input-label">Your password<span className="required">*</span></label>
              <input type="password" className="input-field" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" minLength={8} required />
            </div>
            <div className="input-group">
              <label className="input-label">Business password<span className="required">*</span></label>
              <input type="password" className="input-field" value={businessPassword} onChange={(e) => setBusinessPassword(e.target.value)} placeholder="Share with your team" minLength={6} required />
            </div>
          </div>
          <span className="input-help" style={{ marginTop: -8 }}>
            Employees use the business password to join your team — keep it different from your own password.
          </span>

          <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
            {loading ? <span className="spinner spinner-sm" /> : 'Create business'}
          </button>
        </form>
      ) : (
        <form className={styles.form} onSubmit={submitJoin}>
          <div className="input-group" style={{ position: 'relative' }}>
            <label className="input-label">Your business<span className="required">*</span></label>
            {selected ? (
              <div className="flex items-center gap-2">
                <div className="input-field" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>{selected.name}{selected.city ? ` — ${selected.city}` : ''}</span>
                  <button type="button" className="text-xs" style={{ background: 'none', border: 'none', color: 'var(--color-accent)', cursor: 'pointer' }} onClick={() => { setSelected(null); setQuery(''); setHits([]); }}>
                    Change
                  </button>
                </div>
              </div>
            ) : (
              <>
                <input
                  className="input-field"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (!e.target.value.trim()) setHits([]);
                  }}
                  placeholder="Start typing your business name…"
                  autoComplete="off"
                />
                {hits.length > 0 && (
                  <div
                    className="card"
                    style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 4, overflow: 'hidden' }}
                  >
                    {hits.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => { setSelected(h); setHits([]); }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
                          background: 'none', border: 'none', color: 'var(--color-text-primary)', cursor: 'pointer',
                          borderBottom: '1px solid var(--color-border-subtle)', fontSize: 14,
                        }}
                      >
                        {h.name}
                        {h.city && <span className="text-xs text-muted"> — {h.city}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            <span className="input-help">Matches appear as you type.</span>
          </div>

          <div className="input-group">
            <label className="input-label">Business password<span className="required">*</span></label>
            <input type="password" className="input-field" value={joinPassword} onChange={(e) => setJoinPassword(e.target.value)} placeholder="Ask your manager for it" required />
          </div>

          <div className="input-group">
            <label className="input-label">Your full name<span className="required">*</span></label>
            <input className="input-field" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
          </div>

          <div className={styles.formRow}>
            <div className="input-group">
              <label className="input-label">Email<span className="required">*</span></label>
              <input type="email" className="input-field" value={joinEmail} onChange={(e) => setJoinEmail(e.target.value)} autoComplete="email" required />
            </div>
            <div className="input-group">
              <label className="input-label">Password<span className="required">*</span></label>
              <input type="password" className="input-field" value={joinUserPassword} onChange={(e) => setJoinUserPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" minLength={8} required />
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
            {loading ? <span className="spinner spinner-sm" /> : 'Join business'}
          </button>
        </form>
      )}

      <div className="mt-4">
        <SocialButtons />
      </div>

      <p className={styles.formFooter}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="spinner spinner-lg" />}>
      <RegisterContent />
    </Suspense>
  );
}
