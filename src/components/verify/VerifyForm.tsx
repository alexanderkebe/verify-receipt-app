'use client';

import { useEffect, useRef, useState } from 'react';
import { PROVIDER_LABELS, type Provider, type VerificationResult } from '@/types';
import { findReceiptReference } from '@/lib/receipt-input';
import { getJsQr } from '@/lib/image-extract';
import ResultCard from './ResultCard';

const PROVIDERS = Object.keys(PROVIDER_LABELS) as Provider[];
const QR_SCANNER_PROVIDERS = new Set<Provider>(['CBE', 'CBE_BIRR', 'ABYSSINIA']);

// Pre-sized 128px variants (see public/providers/) — the originals were up
// to 645KB for logos rendered at 32-48px.
const PROVIDER_LOGOS: Record<Provider, string> = {
  CBE: '/providers/cbe.png',
  TELEBIRR: '/Telebirr (SVG) @Izuki Labs.svg',
  DASHEN: '/providers/dashen.png',
  ABYSSINIA: '/providers/abyssinia.png',
  CBE_BIRR: '/providers/cbebirr.png',
  MPESA: '/providers/mpesa.png',
};

const PROVIDER_THEME_LOGOS: Record<Provider, string> = {
  ...PROVIDER_LOGOS,
  DASHEN: '/providers/dashen-white.png',
  ABYSSINIA: '/providers/abyssinia-white.png',
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
        selectedProvider === 'TELEBIRR'
          ? 'This is a telebirr in-app QR — it can only be verified inside the telebirr app. Take a photo of the receipt or type the transaction number instead.'
          : 'Could not read a receipt reference from this QR code. Type the reference manually or use the photo/upload tab instead.';
      // Functional update so re-detecting the same QR every frame doesn't re-render
      setScanNotice((prev) => (prev === msg ? prev : msg));
      return false;
    }
    if (parsed.appOnly) {
      // App-internal QR (Dashen SuperApp): no public endpoint can verify it.
      // Point the cashier at the flow that works — the shared PDF receipt.
      const msg =
        'This is a Dashen SuperApp in-app QR — it can only be opened in the SuperApp. In Dashen, tap Share on the receipt to save the PDF, then use the Photo / upload tab here to upload it.';
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
    if (
      mode !== 'scan' ||
      result ||
      !selectedProvider ||
      !QR_SCANNER_PROVIDERS.has(selectedProvider)
    ) {
      return;
    }
    let cancelled = false;
    let rafId = 0;
    const canvas = document.createElement('canvas');

    let frame = 0;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Chrome/Android ships a native QR detector — the same engine the
    // phone's built-in camera app uses. It reads glary, angled, or
    // screen-displayed codes that jsQR misses, so prefer it when present.
    interface NativeDetector {
      detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
    }
    interface BarcodeDetectorCtor {
      new (options?: { formats?: string[] }): NativeDetector;
      getSupportedFormats?: () => Promise<string[]>;
    }
    let nativeDetector: NativeDetector | null = null;

    // jsQR is only the fallback decoder — load it lazily so devices with a
    // native BarcodeDetector never pay for it, and throttle it (a full
    // getImageData + decode every animation frame pins the main thread).
    let jsQrLib: Awaited<ReturnType<typeof getJsQr>> | null = null;
    let jsQrRequested = false;
    let lastJsQrAt = 0;
    const JSQR_INTERVAL_MS = 80; // ~12 decode passes per second

    const decodeWithJsQr = (video: HTMLVideoElement): string | null => {
      const jsQR = jsQrLib;
      if (!ctx || !jsQR) return null;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      // Cycle through three passes so every kind of code gets covered:
      // the centre square at native resolution (dense QRs, e.g. Telebirr,
      // need the module resolution), in both inversion modes, plus the
      // whole frame downscaled (large codes or ones outside the guide).
      const step = frame % 3;
      frame++;
      if (step === 1) {
        const scale = Math.min(1, 800 / Math.max(vw, vh));
        canvas.width = Math.round(vw * scale);
        canvas.height = Math.round(vh * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } else {
        const cropSize = Math.round(Math.min(vw, vh) * 0.8);
        const sx = Math.round((vw - cropSize) / 2);
        const sy = Math.round((vh - cropSize) / 2);
        canvas.width = cropSize;
        canvas.height = cropSize;
        ctx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, cropSize, cropSize);
      }
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(image.data, image.width, image.height, {
        inversionAttempts: step === 1 ? 'attemptBoth' : step === 0 ? 'dontInvert' : 'onlyInvert',
      });
      return code?.data ?? null;
    };

    const tick = async () => {
      if (cancelled || !scanningRef.current) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.videoWidth) {
        let text: string | null = null;
        if (nativeDetector) {
          try {
            const codes = await nativeDetector.detect(video);
            text = codes.find((c) => c.rawValue)?.rawValue ?? null;
          } catch {
            nativeDetector = null; // detector failed at runtime — fall back to jsQR
          }
        }
        if (!text) {
          if (!jsQrLib && !jsQrRequested) {
            jsQrRequested = true;
            void getJsQr().then((lib) => {
              jsQrLib = lib;
            });
          }
          const now = performance.now();
          if (jsQrLib && now - lastJsQrAt >= JSQR_INTERVAL_MS) {
            lastJsQrAt = now;
            text = decodeWithJsQr(video);
          }
        }
        if (cancelled || !scanningRef.current) return;
        if (text && handleQrDetected(text)) {
          // Accepted — camera stopped, verification in flight
          scanningRef.current = false;
          return;
        }
        // Unreadable/unparseable QR: keep scanning
      }
      rafId = requestAnimationFrame(() => void tick());
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

        // Ask the camera to keep refocusing — some Android browsers lock
        // focus at arm's length and QR codes stay blurry forever, which is
        // why the phone's camera app reads codes this scanner missed.
        const track = stream.getVideoTracks()[0];
        await track
          ?.applyConstraints({
            advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet],
          })
          .catch(() => {}); // focusMode unsupported — keep the default

        const BD = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
        if (BD) {
          try {
            const formats = (await BD.getSupportedFormats?.()) ?? ['qr_code'];
            if (formats.includes('qr_code')) nativeDetector = new BD({ formats: ['qr_code'] });
          } catch {
            nativeDetector = null;
          }
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        scanningRef.current = true;
        rafId = requestAnimationFrame(() => void tick());
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
    if (!selectedProvider || !QR_SCANNER_PROVIDERS.has(selectedProvider)) {
      setMode('manual');
      return;
    }
    setCameraError(null);
    setScanNotice(null);
    setError(null);
    setMode('scan');
  }

  function selectProvider(provider: Provider) {
    stopCamera();
    setCameraError(null);
    setScanNotice(null);
    setSelectedProvider(provider);
    setMode(QR_SCANNER_PROVIDERS.has(provider) ? 'scan' : 'manual');
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    await runVerification(input, selectedProvider ?? undefined);
  }

  // Exact PDF text and QR data are read on-device first. Hosted OCR is an
  // optional fallback; Tesseract remains available if it is disabled/fails.
  async function uploadVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    try {
      const { extractReceiptData } = await import('@/lib/image-extract');
      const extracted = await extractReceiptData(file, setExtractStatus, {
        provider: selectedProvider ?? undefined,
      });
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
              onClick={() => selectProvider(p)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  selectProvider(p);
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
      {mode === 'scan' && QR_SCANNER_PROVIDERS.has(selectedProvider) ? (
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

          {/* Floating Bottom Tabs Bar */}
          <div className="scanner-tabs-container">
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
                className={`tab ${(mode as string) === 'manual' ? 'active' : ''}`}
                onClick={() => setMode('manual')}
              >
                Manual entry
              </button>
              <button
                type="button"
                className={`tab ${(mode as string) === 'upload' ? 'active' : ''}`}
                onClick={() => setMode('upload')}
              >
                Photo / upload
              </button>
            </div>
          </div>
          
          {(scanNotice || error) && (
            <div
              style={{
                position: 'absolute',
                top: '90px',
                left: '20px',
                right: '20px',
                zIndex: 1020,
              }}
            >
              {error && <div className="alert alert-danger m-0 shadow mb-2">{error}</div>}
              {scanNotice && <div className="alert alert-warning m-0 shadow">{scanNotice}</div>}
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
            {QR_SCANNER_PROVIDERS.has(selectedProvider) && (
              <button
                type="button"
                className={`tab ${(mode as string) === 'scan' ? 'active' : ''}`}
                onClick={openScanTab}
              >
                Scan QR code
              </button>
            )}
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
                  accept="image/*,application/pdf"
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
                    🖼 Image or PDF
                  </button>
                </div>
                {filePreview && (
                  <div className="flex items-center gap-3 mt-2">
                    {file?.type === 'application/pdf' ? (
                      <div
                        style={{
                          width: 64,
                          height: 64,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 8,
                          border: '1px solid var(--color-border)',
                          background: 'var(--color-surface-2, #f4f4f5)',
                          fontSize: 11,
                          fontWeight: 600,
                          color: 'var(--color-text-secondary)',
                        }}
                      >
                        PDF
                      </div>
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
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
                    )}
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
                  Upload a photo, screenshot, or PDF receipt (e.g. the Dashen SuperApp receipt). PDF
                  text and QR codes are read on your device first. When online OCR is enabled, an
                  optimized receipt image may be sent securely to the configured OCR service.
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
