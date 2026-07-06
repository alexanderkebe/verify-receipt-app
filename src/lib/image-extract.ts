// ============================================
// On-device receipt extraction (client-side only)
// Reads the QR code or reference number out of a receipt
// photo in the browser. The image itself is never uploaded —
// only the extracted reference/link is sent for verification.
// ============================================

import jsQR from 'jsqr';

export interface ExtractionResult {
  /** The text to verify: a receipt URL (from QR) or a bare reference */
  input: string;
  source: 'qr' | 'ocr';
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not read the image file'));
      img.src = url;
    });
    return img;
  } finally {
    // Revoke after decode completes; the pixels are already in memory
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function drawToCanvas(img: HTMLImageElement, maxDim: number): HTMLCanvasElement {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function tryDecodeQr(img: HTMLImageElement): string | null {
  // Try a few sizes — QR density vs. resolution trade-off
  for (const maxDim of [1000, 1600, 2400]) {
    const canvas = drawToCanvas(img, maxDim);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(data.data, data.width, data.height);
    if (code?.data?.trim()) return code.data.trim();
    if (maxDim >= Math.max(img.naturalWidth, img.naturalHeight)) break;
  }
  return null;
}

/** Find a payment reference in OCR'd receipt text */
export function findReferenceInText(text: string): string | null {
  const cleaned = text.replace(/[^\x20-\x7E\n]/g, ' ');

  // CBE receipt URL printed as text
  const url = cleaned.match(/https?:\/\/\S*cbe\.com\.et\S*/i);
  if (url) return url[0];

  // CBE reference: FT + 10 alphanumerics (allow trailing suffix digits)
  const ft = cleaned.match(/\bFT[A-Z0-9]{10}(?:[0-9]{8})?\b/i);
  if (ft) return ft[0].toUpperCase();

  // Labelled reference/receipt number (Telebirr, M-Pesa, Dashen…)
  const labelled = cleaned.match(
    /(?:reference|receipt|transaction|invoice)\s*(?:no|number|id)?\s*(?:\([^)]*\))?\s*[.:#]?\s+([A-Z0-9]{8,20})\b/i,
  );
  if (labelled && /[0-9]/.test(labelled[1])) return labelled[1].toUpperCase();

  return null;
}

async function tryOcr(img: HTMLImageElement, onStatus?: (s: string) => void): Promise<string | null> {
  onStatus?.('Reading text from the photo…');
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  try {
    const canvas = drawToCanvas(img, 2000);
    const {
      data: { text },
    } = await worker.recognize(canvas);
    return findReferenceInText(text);
  } finally {
    await worker.terminate();
  }
}

/**
 * Extract a verifiable reference from a receipt photo, entirely on-device.
 * Order: QR code (contains the full receipt link with suffix) → OCR text.
 */
export async function extractReceiptData(
  file: File,
  onStatus?: (s: string) => void,
): Promise<ExtractionResult | null> {
  onStatus?.('Looking for the QR code…');
  const img = await loadImage(file);

  const qr = tryDecodeQr(img);
  if (qr) return { input: qr, source: 'qr' };

  const ref = await tryOcr(img, onStatus);
  if (ref) return { input: ref, source: 'ocr' };

  return null;
}
