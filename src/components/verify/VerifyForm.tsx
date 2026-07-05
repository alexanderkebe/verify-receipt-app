'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { PROVIDER_LABELS, type Provider, type VerificationResult } from '@/types';
import { PROVIDER_REQUIRED_FIELDS } from '@/lib/constants';
import ResultCard from './ResultCard';

const PROVIDERS = Object.keys(PROVIDER_LABELS) as Provider[];

interface ParsedQr {
  provider: Provider | null;
  reference: string;
  suffix?: string;
}

/**
 * Parse the QR code printed on Ethiopian payment receipts.
 * CBE receipts encode a URL like https://apps.cbe.com.et:100/?id=FT26123ABC1240001234
 * (12-char reference + 8-digit account suffix); Telebirr encodes a link to
 * transactioninfo.ethiotelecom.et/receipt/<ref>; others vary.
 */
function parseReceiptQr(text: string): ParsedQr | null {
  const raw = text.trim();
  const lower = raw.toLowerCase();

  const getParam = (names: string[]): string | null => {
    try {
      const url = new URL(raw);
      for (const n of names) {
        const v = url.searchParams.get(n);
        if (v) return v.trim();
      }
      // Fall back to the last path segment
      const seg = url.pathname.split('/').filter(Boolean).pop();
      return seg?.trim() || null;
    } catch {
      return null;
    }
  };

  // CBE — reference (FT…) with the account suffix appended
  if (lower.includes('cbe.com.et')) {
    const id = getParam(['id', 'ref', 'reference', 'trx']);
    if (id) {
      if (/^FT/i.test(id) && id.length > 12) {
        return { provider: 'CBE', reference: id.slice(0, 12).toUpperCase(), suffix: id.slice(12) };
      }
      return { provider: 'CBE', reference: id.toUpperCase() };
    }
    return null;
  }

  // Telebirr
  if (lower.includes('ethiotelecom') || lower.includes('telebirr')) {
    const ref = getParam(['receiptno', 'receiptNo', 'ref', 'reference', 'id', 'trx']);
    if (ref) return { provider: 'TELEBIRR', reference: ref.toUpperCase() };
    return null;
  }

  // Dashen
  if (lower.includes('dashen')) {
    const ref = getParam(['id', 'ref', 'reference', 'trx', 'transactionid']);
    if (ref) return { provider: 'DASHEN', reference: ref.toUpperCase() };
    return null;
  }

  // Bank of Abyssinia
  if (lower.includes('abyssinia') || lower.includes('boa')) {
    const ref = getParam(['id', 'ref', 'reference', 'trx']);
    if (ref) return { provider: 'ABYSSINIA', reference: ref.toUpperCase() };
    return null;
  }

  // M-Pesa
  if (lower.includes('mpesa') || lower.includes('m-pesa') || lower.includes('safaricom')) {
    const ref = getParam(['id', 'ref', 'receipt', 'reference']);
    if (ref) return { provider: 'MPESA', reference: ref.toUpperCase() };
    return null;
  }

  // Unknown URL — try common parameter names
  if (lower.startsWith('http')) {
    const ref = getParam(['id', 'ref', 'reference', 'receipt', 'receiptno', 'trx', 'transactionid']);
    if (ref && /^[A-Za-z0-9]{6,30}$/.test(ref)) {
      return { provider: null, reference: ref.toUpperCase() };
    }
    return null;
  }

  // Plain text that looks like a transaction reference
  if (/^[A-Za-z0-9]{6,30}$/.test(raw)) {
    const upper = raw.toUpperCase();
    const provider: Provider | null = upper.startsWith('FT') ? 'CBE' : null;
    return { provider, reference: upper };
  }

  return null;
}

export default function VerifyForm() {
  const [mode, setMode] = useState<'scan' | 'manual' | 'upload'>('scan');
  const [provider, setProvider] = useState<Provider>('CBE');
  const [reference, setReference] = useState('');
  const [suffix, setSuffix] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [expectedAmount, setExpectedAmount] = useState('');
  const [file, setFile] = useState<File | null>(null);

  // QR scanner state
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [decided, setDecided] = useState(false);
  const [decisionMsg, setDecisionMsg] = useState<string | null>(null);

  const required = PROVIDER_REQUIRED_FIELDS[provider];
  const needsSuffix = required.includes('suffix');
  const needsPhone = required.includes('phoneNumber');

  function stopCamera() {
    scanningRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function clearResultState() {
    setError(null);
    setResult(null);
    setDecided(false);
    setDecisionMsg(null);
  }

  async function runVerification(input: {
    provider: Provider;
    reference: string;
    suffix?: string;
    phoneNumber?: string;
  }) {
    clearResultState();
    setLoading(true);
    const res = await fetch('/api/verify/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: input.provider,
        reference: input.reference.trim(),
        suffix: input.suffix || undefined,
        phoneNumber: input.phoneNumber || undefined,
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

  function handleQrDetected(text: string) {
    const parsed = parseReceiptQr(text);
    if (!parsed) {
      // Not a receipt QR — keep scanning, but tell the user
      setScanNotice('QR code detected, but it does not look like a payment receipt. Keep trying or use manual entry.');
      scanningRef.current = true;
      return;
    }

    stopCamera();
    const detectedProvider = parsed.provider ?? provider;
    setProvider(detectedProvider);
    setReference(parsed.reference);
    if (parsed.suffix) setSuffix(parsed.suffix);

    const req = PROVIDER_REQUIRED_FIELDS[detectedProvider];
    const missingSuffix = req.includes('suffix') && !parsed.suffix;
    const missingPhone = req.includes('phoneNumber');
    if (!parsed.provider || missingSuffix || missingPhone) {
      // Need a detail the QR didn't contain — hand off to the prefilled manual form
      setMode('manual');
      setScanNotice(null);
      setError(
        !parsed.provider
          ? 'QR scanned — confirm the provider below and verify.'
          : 'QR scanned — fill in the missing detail below and verify.',
      );
      return;
    }

    void runVerification({
      provider: detectedProvider,
      reference: parsed.reference,
      suffix: parsed.suffix,
    });
  }

  // Start/stop the camera + QR scan loop as the user enters/leaves scan mode
  useEffect(() => {
    if (mode !== 'scan' || result) return;
    let cancelled = false;
    let rafId = 0;
    const canvas = document.createElement('canvas');

    const tick = () => {
      if (cancelled || !scanningRef.current) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.videoWidth) {
        // Downscale for faster decoding
        const scale = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
          if (code?.data) {
            scanningRef.current = false;
            handleQrDetected(code.data);
            return;
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        scanningRef.current = true;
        rafId = requestAnimationFrame(tick);
      } catch (err) {
        if (cancelled) return;
        const name = (err as Error)?.name;
        setCameraError(
          name === 'NotAllowedError'
            ? 'Camera access was denied. Allow camera permission in your browser and try again.'
            : name === 'NotFoundError'
              ? 'No camera was found on this device. Use manual entry or upload instead.'
              : 'Could not start the camera. Make sure you are on HTTPS and no other app is using it.',
        );
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, result]);

  function openScanTab() {
    setCameraError(null);
    setScanNotice(null);
    setError(null);
    setMode('scan');
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    await runVerification({ provider, reference, suffix, phoneNumber });
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
    setScanNotice(null);
    setCameraError(null);
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
          className={`tab ${mode === 'scan' ? 'active' : ''}`}
          onClick={openScanTab}
        >
          Scan QR code
        </button>
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

      {mode === 'scan' ? (
        <div className="card card-padding">
          {cameraError ? (
            <div className="alert alert-danger mb-4">{cameraError}</div>
          ) : (
            <div className="input-group mb-4">
              <label className="input-label">Point the camera at the QR code on the receipt</label>
              <div
                style={{
                  position: 'relative',
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: '#000',
                  aspectRatio: '1 / 1',
                }}
              >
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                {/* Scan frame overlay */}
                <div
                  style={{
                    position: 'absolute',
                    inset: '15%',
                    border: '2px solid rgba(245, 166, 35, 0.9)',
                    borderRadius: 12,
                    boxShadow: '0 0 0 999px rgba(0, 0, 0, 0.35)',
                    pointerEvents: 'none',
                  }}
                />
                {loading && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgba(0,0,0,0.55)',
                    }}
                  >
                    <span className="spinner spinner-lg" />
                  </div>
                )}
              </div>
              <span className="input-help">
                Verification starts automatically as soon as the QR code is read.
              </span>
            </div>
          )}

          {scanNotice && <div className="alert alert-warning mb-4">{scanNotice}</div>}

          <div className="input-group">
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
            <span className="input-help">Enter this before scanning to flag amount mismatches.</span>
          </div>
        </div>
      ) : mode === 'upload' ? (
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
