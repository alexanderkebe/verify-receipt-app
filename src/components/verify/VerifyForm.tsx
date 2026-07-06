'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import type { VerificationResult } from '@/types';
import { findReceiptReference } from '@/lib/receipt-input';
import ResultCard from './ResultCard';

export default function VerifyForm() {
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
  // Guards the live-frame OCR fallback (app-only QRs, e.g. telebirr in-app)
  const ocrBusyRef = useRef(false);
  const ocrLastTriedRef = useRef(0);

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
  async function runVerification(rawInput: string) {
    clearResultState();
    setLoading(true);
    try {
      const res = await fetch('/api/verify/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: rawInput.trim(),
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
      // App-only QR (e.g. telebirr's in-app receipt QR is verifiable only by
      // the telebirr SuperApp). The transaction number is printed on the
      // receipt though — read it from the camera frame with OCR instead.
      const msg =
        'This QR code can only be verified inside its own app — reading the printed transaction number instead. Hold the receipt steady so the transaction number is inside the frame.';
      // Functional update so re-detecting the same QR every frame doesn't re-render
      setScanNotice((prev) => (prev === msg ? prev : msg));
      void tryFrameOcr();
      return false;
    }
    stopCamera();
    setInput(parsed.reference);
    void runVerification(t);
    return true;
  }

  /** One-shot OCR of the current camera frame (throttled) to find the printed reference */
  async function tryFrameOcr() {
    const now = Date.now();
    if (ocrBusyRef.current || now - ocrLastTriedRef.current < 5000) return;
    ocrBusyRef.current = true;
    ocrLastTriedRef.current = now;
    try {
      const video = videoRef.current;
      if (!video || !video.videoWidth) return;
      // Full frame — the reference is usually printed near, not inside, the QR
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0);
      const { ocrCanvasForReference } = await import('@/lib/image-extract');
      const ref = await ocrCanvasForReference(canvas);
      if (ref && scanningRef.current) {
        stopCamera();
        setScanNotice(null);
        setInput(ref);
        void runVerification(ref);
      }
    } catch {
      // OCR is best-effort; the notice already points to manual entry
    } finally {
      ocrBusyRef.current = false;
    }
  }

  // Start/stop the camera + QR scan loop as the user enters/leaves scan mode
  useEffect(() => {
    if (mode !== 'scan' || result) return;
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
  }, [mode, result, scanEpoch]);

  function openScanTab() {
    setCameraError(null);
    setScanNotice(null);
    setError(null);
    setMode('scan');
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    await runVerification(input);
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
      await runVerification(extracted.input);
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
          Photo / upload
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
                Provider is detected automatically and verification starts as soon as the code is read.
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
              placeholder="e.g. FT24351ABCD or https://apps.cbe.com.et/?id=…"
              required
            />
            <span className="input-help">
              The payment provider is detected automatically. For CBE, pasting the receipt link verifies in one step.
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
    </div>
  );
}
