'use client';

import { useEffect, useRef, useState } from 'react';
import { PROVIDER_LABELS, type Provider, type VerificationResult } from '@/types';
import { PROVIDER_REQUIRED_FIELDS } from '@/lib/constants';
import ResultCard from './ResultCard';

const PROVIDERS = Object.keys(PROVIDER_LABELS) as Provider[];

export default function VerifyForm() {
  const [mode, setMode] = useState<'manual' | 'upload' | 'camera'>('manual');
  const [provider, setProvider] = useState<Provider>('CBE');
  const [reference, setReference] = useState('');
  const [suffix, setSuffix] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [expectedAmount, setExpectedAmount] = useState('');
  const [file, setFile] = useState<File | null>(null);

  // Camera state
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [decided, setDecided] = useState(false);
  const [decisionMsg, setDecisionMsg] = useState<string | null>(null);

  const required = PROVIDER_REQUIRED_FIELDS[provider];
  const needsSuffix = required.includes('suffix');
  const needsPhone = required.includes('phoneNumber');

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function discardCapture() {
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    setCapturedBlob(null);
    setCapturedUrl(null);
  }

  function openCameraTab() {
    setCameraReady(false);
    setCameraError(null);
    setMode('camera');
  }

  // Start/stop the camera as the user enters/leaves camera mode
  useEffect(() => {
    if (mode !== 'camera' || result || capturedBlob) return;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('unsupported');
        }
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
        setCameraReady(true);
      } catch (err) {
        if (cancelled) return;
        const name = (err as Error)?.name;
        setCameraError(
          name === 'NotAllowedError'
            ? 'Camera access was denied. Allow camera permission in your browser and try again.'
            : name === 'NotFoundError'
              ? 'No camera was found on this device. Use "Upload image" instead.'
              : 'Could not start the camera. Make sure you are on HTTPS and no other app is using it.',
        );
      }
    })();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [mode, result, capturedBlob]);

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCapturedBlob(blob);
        setCapturedUrl(URL.createObjectURL(blob));
        setCameraReady(false);
        stopCamera();
      },
      'image/jpeg',
      0.92,
    );
  }

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

  async function submitImage(image: File) {
    clearResultState();
    setLoading(true);
    const fd = new FormData();
    fd.append('image', image);
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

  async function uploadVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    await submitImage(file);
  }

  async function cameraVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!capturedBlob) return;
    await submitImage(new File([capturedBlob], 'camera-receipt.jpg', { type: 'image/jpeg' }));
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
    discardCapture();
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
          className={`tab ${mode === 'camera' ? 'active' : ''}`}
          onClick={openCameraTab}
        >
          Scan with camera
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

      {mode === 'camera' ? (
        <form className="card card-padding" onSubmit={cameraVerify}>
          {cameraError ? (
            <div className="alert alert-danger mb-4">{cameraError}</div>
          ) : (
            <div className="input-group mb-4">
              <label className="input-label">
                {capturedUrl ? 'Captured receipt' : 'Point the camera at the receipt'}
              </label>
              <div
                style={{
                  position: 'relative',
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: '#000',
                  aspectRatio: '4 / 3',
                }}
              >
                {capturedUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={capturedUrl}
                    alt="Captured receipt"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                )}
              </div>
              <span className="input-help">
                {capturedUrl
                  ? 'Check the reference number is readable, then verify.'
                  : 'Hold steady and make sure the reference number is in focus.'}
              </span>
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
          </div>

          {capturedUrl ? (
            <div className="flex gap-3">
              <button
                type="button"
                className="btn btn-secondary w-full"
                onClick={discardCapture}
                disabled={loading}
              >
                Retake
              </button>
              <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                {loading ? <span className="spinner spinner-sm" /> : 'Verify receipt'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-lg w-full"
              onClick={capturePhoto}
              disabled={!cameraReady || Boolean(cameraError)}
            >
              Capture photo
            </button>
          )}
        </form>
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
