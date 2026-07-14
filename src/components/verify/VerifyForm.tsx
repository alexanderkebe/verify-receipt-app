'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { PROVIDER_LABELS, PROVIDER_COLORS, type Provider, type VerificationResult } from '@/types';
import { findReceiptReference } from '@/lib/receipt-input';
import ResultCard from './ResultCard';

const PROVIDERS = Object.keys(PROVIDER_LABELS) as Provider[];

const PROVIDER_LOGOS: Record<Provider, string> = {
  CBE: '/Commercial Bank Of Ethiopia (SVG) @Izuki Labs.svg',
  TELEBIRR: '/Telebirr (SVG) @Izuki Labs.svg',
  DASHEN: '/dashen_bank bank icon.png',
  ABYSSINIA: '/abyssinia icon.png',
  CBE_BIRR: '/CBE Birr (PNG) @Izuki Labs.png',
  MPESA: '/m-pesa logo and icon.png',
};

const PROVIDER_THEME_LOGOS: Record<Provider, string> = {
  ...PROVIDER_LOGOS,
  DASHEN: '/dashin-icon-white.png',
  ABYSSINIA: '/abyssinia-white-icon.png',
};

const PROVIDER_SUBTITLES: Record<Provider, string> = {
  CBE: 'Bank',
  TELEBIRR: 'Mobile Wallet',
  DASHEN: 'Bank',
  ABYSSINIA: 'Bank',
  CBE_BIRR: 'Mobile Wallet',
  MPESA: 'Mobile Wallet',
};

const PROVIDER_HELP_TEXTS: Record<Provider, string> = {
  CBE: 'Enter the 12-digit transaction reference starting with FT (e.g. FT24123ABCDE) or paste a CBE receipt link.',
  TELEBIRR: 'Enter the 10-digit alphanumeric transaction ID (e.g. DG61L8C6XB) or paste a Telebirr receipt link.',
  DASHEN: 'Enter the Dashen Bank transaction reference number.',
  ABYSSINIA: 'Enter the Bank of Abyssinia transaction reference number.',
  CBE_BIRR: 'Enter the CBE Birr receipt number.',
  MPESA: 'Enter the M-Pesa receipt number.',
};

const PROVIDER_PLACEHOLDERS: Record<Provider, string> = {
  CBE: 'e.g. FT24123ABCDE',
  TELEBIRR: 'e.g. DG61L8C6XB',
  DASHEN: 'e.g. DS987654321',
  ABYSSINIA: 'e.g. AB12345678',
  CBE_BIRR: 'e.g. CB12345678',
  MPESA: 'e.g. MP12345678',
};

export default function VerifyForm() {
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [mode, setMode] = useState<'scan' | 'manual' | 'upload'>('scan');
  const [input, setInput] = useState('');
  const [expectedAmount, setExpectedAmount] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // QR scanner state
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  // Bumped to restart the camera (e.g. after a failed verification)
  const [scanEpoch, setScanEpoch] = useState(0);

  const [loading, setLoading] = useState(false);
  const [extractStatus, setExtractStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [decided, setDecided] = useState(false);
  const [decisionMsg, setDecisionMsg] = useState<string | null>(null);

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

  function pickFile(picked: File | null) {
    setError(null);
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFile(picked);
    setFilePreview(picked ? URL.createObjectURL(picked) : null);
  }

  // Step 1: reference number or receipt URL → Step 2: check on the API →
  // Step 3: the result card shows what the API returned.
  async function runVerification(rawInput: string, provider?: Provider) {
    clearResultState();
    setLoading(true);
    try {
      const res = await fetch('/api/verify/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: rawInput.trim(),
          provider,
          expectedAmount: expectedAmount ? Number(expectedAmount) : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setError(json.error || 'Verification failed. Please try again.');
        setScanEpoch((e) => e + 1); // restart the camera if we're on the scan tab
        return;
      }
      setResult(json.data as VerificationResult);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setScanEpoch((e) => e + 1);
    } finally {
      setLoading(false);
    }
  }

  /** Returns true when the QR was accepted and verification started. */
  function handleQrDetected(text: string): boolean {
    const t = text.trim();
    const parsed = findReceiptReference(t);
    if (!parsed) {
      // App-only QR: telebirr's in-app receipt QR is an encrypted payload
      // that only the telebirr SuperApp can verify. Point the cashier at the
      // paths that work — a screenshot/photo of the receipt, or typing the
      // printed transaction number.
      const msg =
        'This is a telebirr in-app QR — it can only be verified inside the telebirr app. Take a photo of the receipt or type the transaction number instead.';
      // Functional update so re-detecting the same QR every frame doesn't re-render
      setScanNotice((prev) => (prev === msg ? prev : msg));
      return false;
    }
    stopCamera();
    setInput(parsed.reference);
    void runVerification(t, selectedProvider ?? undefined);
    return true;
  }

  // Start/stop the camera + QR scan loop as the user enters/leaves scan mode
  useEffect(() => {
    if (mode !== 'scan' || result || !selectedProvider) return;
    let cancelled = false;
    let rafId = 0;
    const canvas = document.createElement('canvas');

    let frame = 0;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const tick = () => {
      if (cancelled || !scanningRef.current) return;
      const video = videoRef.current;
      if (ctx && video && video.readyState >= 2 && video.videoWidth) {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        // Crop to the centre square (where the scan frame guides the user) and
        // read it at native resolution. Dense QRs (e.g. Telebirr) need the extra
        // module resolution that downscaling the whole frame would destroy.
        const cropSize = Math.round(Math.min(vw, vh) * 0.8);
        const sx = Math.round((vw - cropSize) / 2);
        const sy = Math.round((vh - cropSize) / 2);
        canvas.width = cropSize;
        canvas.height = cropSize;
        ctx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, cropSize, cropSize);
        const image = ctx.getImageData(0, 0, cropSize, cropSize);
        // Alternate inversion mode each frame so both dark- and light-background
        // QR codes are covered without doubling per-frame work.
        const code = jsQR(image.data, image.width, image.height, {
          inversionAttempts: frame % 2 === 0 ? 'dontInvert' : 'onlyInvert',
        });
        frame++;
        if (code?.data && handleQrDetected(code.data)) {
          // Accepted — camera stopped, verification in flight
          scanningRef.current = false;
          return;
        }
        // Unreadable/unparseable QR: keep scanning
      }
      rafId = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
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
  }, [mode, result, scanEpoch, selectedProvider]);

  function openScanTab() {
    setCameraError(null);
    setScanNotice(null);
    setError(null);
    setMode('scan');
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    await runVerification(input, selectedProvider ?? undefined);
  }

  // The photo is processed on-device: QR decode first, then OCR.
  // Only the extracted reference/link is sent to the server.
  async function uploadVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    try {
      const { extractReceiptData } = await import('@/lib/image-extract');
      const extracted = await extractReceiptData(file, setExtractStatus);
      setExtractStatus(null);
      if (!extracted) {
        setError(
          'Could not find a QR code or reference number in this photo. Try a sharper photo that includes the QR code, or type the reference manually.',
        );
        return;
      }
      await runVerification(extracted.input, selectedProvider ?? undefined);
    } catch {
      setExtractStatus(null);
      setError('Could not read this image. Try another photo or use manual entry.');
    }
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
    setInput('');
    setExpectedAmount('');
    pickFile(null);
    setScanNotice(null);
    setCameraError(null);
    clearResultState();
  }

  if (result) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto' }} className={selectedProvider === 'CBE' ? 'cbe-theme' : selectedProvider === 'CBE_BIRR' ? 'cbe_birr-theme' : selectedProvider === 'TELEBIRR' ? 'telebirr-theme' : selectedProvider === 'DASHEN' ? 'dashen-theme' : selectedProvider === 'ABYSSINIA' ? 'abyssinia-theme' : ''}>
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

  if (!selectedProvider) {
    return (
      <div className="provider-selection-container">
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)' }}>
            Select Payment Provider
          </h2>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
            Choose the bank or mobile wallet account to verify the payment against.
          </p>
        </div>

        <div className="provider-grid">
          {PROVIDERS.map((p) => (
            <div
              key={p}
              className={`provider-card prov-${p.toLowerCase()}`}
              onClick={() => setSelectedProvider(p)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setSelectedProvider(p);
                }
              }}
            >
              <div className="provider-avatar">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={PROVIDER_LOGOS[p]} alt={`${PROVIDER_LABELS[p]} Logo`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }} className={selectedProvider === 'CBE' ? 'cbe-theme' : selectedProvider === 'CBE_BIRR' ? 'cbe_birr-theme' : selectedProvider === 'TELEBIRR' ? 'telebirr-theme' : selectedProvider === 'DASHEN' ? 'dashen-theme' : selectedProvider === 'ABYSSINIA' ? 'abyssinia-theme' : selectedProvider === 'MPESA' ? 'mpesa-theme' : ''}>
      {mode === 'scan' ? (
        <div 
          className="full-screen-scanner" 
          style={{
            '--scanner-accent-color': selectedProvider === 'CBE' ? '#701A75' : 
                                       selectedProvider === 'CBE_BIRR' ? '#882b7a' : 
                                       selectedProvider === 'TELEBIRR' ? '#7CB342' : 
                                       selectedProvider === 'DASHEN' ? '#1254d3' : 
                                       selectedProvider === 'ABYSSINIA' ? '#F3B315' : 
                                       selectedProvider === 'MPESA' ? '#00a859' : '#c08e51'
          } as React.CSSProperties}
        >
          {/* Camera Feed */}
          <div className="scanner-video-container">
            {cameraError ? (
              <div 
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2rem',
                  textAlign: 'center',
                  color: '#ffffff',
                  background: '#09090b',
                }}
              >
                <div>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" style={{ margin: '0 auto 1rem' }}>
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <p style={{ fontSize: '14px', fontWeight: 500 }}>{cameraError}</p>
                  <button 
                    type="button"
                    className="btn btn-sm mt-4" 
                    style={{ background: 'var(--scanner-accent-color)', border: 'none', color: '#fff', padding: '6px 16px', borderRadius: 20 }}
                    onClick={() => setMode('manual')}
                  >
                    Use Manual Entry
                  </button>
                </div>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <div className="scanner-overlay-mask" />
              </>
            )}
          </div>

          {/* Top Action Bar */}
          <div className="scanner-top-bar">
            <button 
              type="button" 
              className="scanner-circle-btn" 
              onClick={() => setMode('manual')}
              title="Close Scanner"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            
            {/* Header Brand Logo Floating */}
            {selectedProvider && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <img 
                  src={PROVIDER_THEME_LOGOS[selectedProvider]} 
                  alt={selectedProvider} 
                  style={{ height: '24px', objectFit: 'contain' }} 
                />
                <span style={{ fontSize: '8px', color: '#ffffff', opacity: 0.8, letterSpacing: '0.08em', marginTop: '2px', textTransform: 'uppercase', fontWeight: 600 }}>
                  {selectedProvider === 'TELEBIRR' ? 'ONE APP FOR ALL YOUR NEEDS!' : selectedProvider === 'DASHEN' ? 'ALWAYS AHEAD!' : selectedProvider === 'ABYSSINIA' ? 'THE CHOICE FOR ALL!' : selectedProvider === 'MPESA' ? 'EXPERIENCE THE FUTURE OF CONVENIENCE' : 'The bank you can always rely on!'}
                </span>
              </div>
            )}

            <div className="scanner-top-right-group">
              <button type="button" className="scanner-circle-btn" title="Toggle Flashlight" onClick={() => {
                setScanNotice(scanNotice ? null : "Flashlight is not supported by your browser");
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                </svg>
              </button>
            </div>
          </div>

          {/* Central Target Scanner Area */}
          {!cameraError && (
            <div className="scanner-target-area">
              <div className="scanner-target-corner top-left" />
              <div className="scanner-target-corner top-right" />
              <div className="scanner-target-corner bottom-left" />
              <div className="scanner-target-corner bottom-right" />
              
              {/* Laser line moving up & down */}
              <div className="scanner-laser-line" />
            </div>
          )}

          {/* Floating Scanning Status Pill */}
          <div className="scanner-status-pill">
            {loading ? 'Processing Receipt...' : 'Align QR code within the frame'}
          </div>

          {/* Floating Bottom Navigation Bar */}
          <div className="scanner-bottom-bar">
            <button 
              type="button" 
              className="scanner-bottom-btn" 
              onClick={() => setMode('manual')}
              title="Manual Entry"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect>
                <line x1="6" y1="8" x2="6.01" y2="8"></line>
                <line x1="10" y1="8" x2="10.01" y2="8"></line>
                <line x1="14" y1="8" x2="14.01" y2="8"></line>
                <line x1="18" y1="8" x2="18.01" y2="8"></line>
                <line x1="6" y1="12" x2="6.01" y2="12"></line>
                <line x1="10" y1="12" x2="10.01" y2="12"></line>
                <line x1="14" y1="12" x2="14.01" y2="12"></line>
                <line x1="18" y1="12" x2="18.01" y2="12"></line>
                <line x1="7" y1="16" x2="17" y2="16"></line>
              </svg>
            </button>

            <button 
              type="button" 
              className="scanner-bottom-btn active-center"
              title="Scanning Mode Active"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7V5a2 2 0 0 1 2-2h2"></path>
                <path d="M17 3h2a2 2 0 0 1 2 2v2"></path>
                <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path>
                <path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>
                <line x1="7" y1="12" x2="17" y2="12"></line>
              </svg>
            </button>

            <button 
              type="button" 
              className="scanner-bottom-btn" 
              onClick={() => setMode('upload')}
              title="Upload Image"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
            </button>
          </div>
          
          {scanNotice && (
            <div 
              style={{
                position: 'absolute',
                top: '90px',
                left: '20px',
                right: '20px',
                zIndex: 1020,
              }}
            >
              <div className="alert alert-warning m-0 shadow">{scanNotice}</div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Selected Provider Banner */}
          {['CBE', 'CBE_BIRR', 'TELEBIRR', 'DASHEN', 'ABYSSINIA', 'MPESA'].includes(selectedProvider) ? (
            <div className="cbe-header-bar">
              <button
                type="button"
                className="cbe-back-btn"
                onClick={() => {
                  setSelectedProvider(null);
                  clearResultState();
                }}
                title="Change Bank"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              </button>
              <span className="cbe-header-title">
                {selectedProvider === 'CBE' ? 'CBE Verification' : selectedProvider === 'CBE_BIRR' ? 'CBE Birr Verification' : selectedProvider === 'TELEBIRR' ? 'telebirr Verification' : selectedProvider === 'DASHEN' ? 'Dashen Verification' : selectedProvider === 'ABYSSINIA' ? 'Abyssinia Verification' : 'M-Pesa Verification'}
              </span>
              {/* Transparent Brand Logo directly on purple/green/blue/yellow background */}
              <img src={PROVIDER_THEME_LOGOS[selectedProvider]} alt={selectedProvider} style={{ height: '32px', width: 'auto', objectFit: 'contain' }} />
            </div>
          ) : (
            <div className="selected-provider-banner">
              <div className="selected-provider-info">
                <div className="selected-provider-avatar">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={PROVIDER_LOGOS[selectedProvider]} alt={PROVIDER_LABELS[selectedProvider]} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
                <div>
                  <div className="selected-provider-name">{PROVIDER_LABELS[selectedProvider]}</div>
                  <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', marginTop: '-2px' }}>
                    Active Verification Provider
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: '4px 12px', fontSize: '12px' }}
                onClick={() => {
                  setSelectedProvider(null);
                  clearResultState();
                }}
              >
                Change Bank
              </button>
            </div>
          )}

          <div className="tabs">
            <button
              type="button"
              className={`tab ${(mode as string) === 'scan' ? 'active' : ''}`}
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
              Photo / upload
            </button>
          </div>

          {error && <div className="alert alert-danger mb-4">{error}</div>}

          {mode === 'upload' ? (
            <form className="card card-padding" onSubmit={uploadVerify}>
              <div className="input-group mb-4">
                <label className="input-label">Receipt photo or screenshot</label>
                {/* Hidden inputs: one opens the camera on phones, one the gallery */}
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
                <div className="flex gap-3">
                  <button
                    type="button"
                    className="btn btn-secondary w-full"
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    📷 Take photo
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary w-full"
                    onClick={() => galleryInputRef.current?.click()}
                  >
                    🖼 Choose image
                  </button>
                </div>
                {filePreview && (
                  <div className="flex items-center gap-3 mt-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={filePreview}
                      alt="Selected receipt"
                      style={{
                        width: 64,
                        height: 64,
                        objectFit: 'cover',
                        borderRadius: 8,
                        border: '1px solid var(--color-border)',
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div className="text-sm font-medium truncate">{file?.name ?? 'Photo'}</div>
                      <button
                        type="button"
                        className="text-xs"
                        style={{ background: 'none', border: 'none', color: 'var(--color-accent)', cursor: 'pointer', padding: 0 }}
                        onClick={() => pickFile(null)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
                <span className="input-help">
                  The QR code or reference number is read on your device — the photo is never uploaded.
                </span>
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
              {extractStatus && (
                <div className="alert alert-info mb-4" style={{ alignItems: 'center' }}>
                  <span className="spinner spinner-sm" /> {extractStatus}
                </div>
              )}
              <button
                type="submit"
                className="btn btn-primary btn-lg w-full"
                disabled={loading || !file || Boolean(extractStatus)}
              >
                {loading || extractStatus ? <span className="spinner spinner-sm" /> : 'Verify receipt'}
              </button>
            </form>
          ) : (
            <form className="card card-padding" onSubmit={verify}>
              <div className="input-group mb-4">
                <label className="input-label">
                  Reference number or receipt link<span className="required">*</span>
                </label>
                <input
                  className="input-field"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={PROVIDER_PLACEHOLDERS[selectedProvider]}
                  required
                />
                <span className="input-help">
                  {PROVIDER_HELP_TEXTS[selectedProvider]}
                </span>
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
                <span className="input-help">Enter what the customer should have paid to flag amount mismatches.</span>
              </div>

              <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
                {loading ? <span className="spinner spinner-sm" /> : 'Verify receipt'}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}

