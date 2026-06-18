'use client';

import { useState } from 'react';
import { PROVIDER_LABELS, type Provider, type VerificationResult } from '@/types';
import { PROVIDER_REQUIRED_FIELDS } from '@/lib/constants';
import ResultCard from './ResultCard';

const PROVIDERS = Object.keys(PROVIDER_LABELS) as Provider[];

export default function VerifyForm() {
  const [mode, setMode] = useState<'manual' | 'upload'>('manual');
  const [provider, setProvider] = useState<Provider>('CBE');
  const [reference, setReference] = useState('');
  const [suffix, setSuffix] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [expectedAmount, setExpectedAmount] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [decided, setDecided] = useState(false);
  const [decisionMsg, setDecisionMsg] = useState<string | null>(null);

  const required = PROVIDER_REQUIRED_FIELDS[provider];
  const needsSuffix = required.includes('suffix');
  const needsPhone = required.includes('phoneNumber');

  function clearResultState() {
    setError(null);
    setResult(null);
    setDecided(false);
    setDecisionMsg(null);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    clearResultState();
    setLoading(true);
    const res = await fetch('/api/verify/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        reference: reference.trim(),
        suffix: suffix || undefined,
        phoneNumber: phoneNumber || undefined,
        expectedAmount: expectedAmount ? Number(expectedAmount) : undefined,
      }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok || !json.success) {
      setError(json.error || 'Verification failed.');
      return;
    }
    setResult(json.data as VerificationResult);
  }

  async function uploadVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    clearResultState();
    setLoading(true);
    const fd = new FormData();
    fd.append('image', file);
    if (expectedAmount) fd.append('expectedAmount', expectedAmount);
    const res = await fetch('/api/verify/scan', { method: 'POST', body: fd });
    const json = await res.json();
    setLoading(false);
    if (!res.ok || !json.success) {
      setError(json.error || 'Verification failed.');
      return;
    }
    setResult(json.data as VerificationResult);
  }

  async function decide(decision: 'ACCEPTED' | 'REJECTED' | 'ESCALATED') {
    if (!result) return;
    setDecisionMsg(null);
    const res = await fetch(`/api/verify/${result.id}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      setDecisionMsg(json.error || 'Could not record decision.');
      return;
    }
    setDecided(true);
    setDecisionMsg(
      decision === 'ACCEPTED'
        ? 'Payment accepted and recorded.'
        : decision === 'REJECTED'
          ? 'Payment rejected and recorded.'
          : 'Escalated to a supervisor for review.',
    );
  }

  function reset() {
    setReference('');
    setSuffix('');
    setPhoneNumber('');
    setExpectedAmount('');
    setFile(null);
    clearResultState();
  }

  if (result) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <ResultCard result={result} />

        {decisionMsg && (
          <div className={`alert mt-4 ${decided ? 'alert-success' : 'alert-danger'}`}>{decisionMsg}</div>
        )}

        {!decided ? (
          <div className="flex gap-3 mt-6">
            <button className="btn btn-success w-full" onClick={() => decide('ACCEPTED')}>
              Accept payment
            </button>
            <button className="btn btn-danger w-full" onClick={() => decide('REJECTED')}>
              Reject
            </button>
            <button className="btn btn-secondary w-full" onClick={() => decide('ESCALATED')}>
              Escalate
            </button>
          </div>
        ) : (
          <button className="btn btn-primary w-full mt-6" onClick={reset}>
            Verify another receipt
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div className="tabs">
        <button
          type="button"
          className={`tab ${mode === 'manual' ? 'active' : ''}`}
          onClick={() => setMode('manual')}
        >
          Manual entry
        </button>
        <button
          type="button"
          className={`tab ${mode === 'upload' ? 'active' : ''}`}
          onClick={() => setMode('upload')}
        >
          Upload image
        </button>
      </div>

      {error && <div className="alert alert-danger mb-4">{error}</div>}

      {mode === 'upload' ? (
        <form className="card card-padding" onSubmit={uploadVerify}>
          <div className="input-group mb-4">
            <label className="input-label">Receipt image or PDF</label>
            <input
              className="input-field"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <span className="input-help">JPEG, PNG, WebP, or PDF up to 10MB.</span>
          </div>
          <div className="input-group mb-6">
            <label className="input-label">Expected amount (ETB)</label>
            <input
              className="input-field"
              type="number"
              step="0.01"
              min="0"
              value={expectedAmount}
              onChange={(e) => setExpectedAmount(e.target.value)}
              placeholder="Optional — enables amount matching"
            />
          </div>
          <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading || !file}>
            {loading ? <span className="spinner spinner-sm" /> : 'Verify image'}
          </button>
        </form>
      ) : (
        <form className="card card-padding" onSubmit={verify}>
          <div className="input-group mb-4">
            <label className="input-label">Provider</label>
            <select
              className="input-field select-field"
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          <div className="input-group mb-4">
            <label className="input-label">
              Transaction reference<span className="required">*</span>
            </label>
            <input
              className="input-field"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. FT24351ABCD"
              required
            />
          </div>

          {needsSuffix && (
            <div className="input-group mb-4">
              <label className="input-label">Account suffix</label>
              <input
                className="input-field"
                value={suffix}
                onChange={(e) => setSuffix(e.target.value)}
                placeholder={provider === 'CBE' ? '8-digit suffix' : '5-digit suffix'}
              />
            </div>
          )}

          {needsPhone && (
            <div className="input-group mb-4">
              <label className="input-label">Phone number</label>
              <input
                className="input-field"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="2519XXXXXXXX"
              />
            </div>
          )}

          <div className="input-group mb-6">
            <label className="input-label">Expected amount (ETB)</label>
            <input
              className="input-field"
              type="number"
              step="0.01"
              min="0"
              value={expectedAmount}
              onChange={(e) => setExpectedAmount(e.target.value)}
              placeholder="Optional — enables amount matching"
            />
            <span className="input-help">Enter what the customer should have paid to flag amount mismatches.</span>
          </div>

          <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
            {loading ? <span className="spinner spinner-sm" /> : 'Verify receipt'}
          </button>
        </form>
      )}
    </div>
  );
}
