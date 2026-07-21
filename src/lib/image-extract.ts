// ============================================
// Receipt extraction pipeline
// Reads exact PDF text and QR data locally, optionally tries a protected
// hosted OCR fallback with an optimized image, then falls back to on-device
// Tesseract. Only the extracted reference is used for verification.
// ============================================

import { findReceiptReference } from '@/lib/receipt-input';
import { findReferenceInText } from '@/lib/receipt-text';
import type { Provider } from '@/types';

export interface ExtractionResult {
  /** The text to verify: a receipt URL (from QR) or a bare reference */
  input: string;
  source: 'qr' | 'ocr' | 'ocrspace';
}

export interface ExtractionOptions {
  provider?: Provider;
}

const HOSTED_OCR_ENABLED = process.env.NEXT_PUBLIC_OCR_FALLBACK_ENABLED === 'true';
const MAX_HOSTED_OCR_BYTES = 950_000;

// jsQR loads on first use so it stays out of the page's initial bundle.
let jsQrPromise: Promise<typeof import('jsqr').default> | null = null;
export function getJsQr() {
  return (jsQrPromise ??= import('jsqr').then((m) => m.default));
}

// One OCR worker per tab — creating a worker re-initialises the tesseract
// WASM core (seconds on mobile), so keep it alive between scans. A failed
// spin-up resets the cache so the next attempt can retry.
type OcrWorker = Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>>;
let ocrWorkerPromise: Promise<OcrWorker> | null = null;
function getOcrWorker(): Promise<OcrWorker> {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = import('tesseract.js').then((m) => m.createWorker('eng'));
    ocrWorkerPromise.catch(() => {
      ocrWorkerPromise = null;
    });
  }
  return ocrWorkerPromise;
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

function resizeCanvas(source: HTMLCanvasElement, maxDim: number): HTMLCanvasElement {
  const scale = Math.min(1, maxDim / Math.max(source.width, source.height));
  if (scale === 1) return source;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

async function prepareHostedOcrImage(canvas: HTMLCanvasElement): Promise<Blob | null> {
  let smallest: Blob | null = null;
  for (const maxDim of [1800, 1500, 1200]) {
    const resized = resizeCanvas(canvas, maxDim);
    for (const quality of [0.82, 0.7, 0.58]) {
      const blob = await canvasToJpeg(resized, quality);
      if (!blob) continue;
      smallest = blob;
      if (blob.size <= MAX_HOSTED_OCR_BYTES) return blob;
    }
  }
  return smallest && smallest.size <= MAX_HOSTED_OCR_BYTES ? smallest : null;
}

async function tryHostedOcr(
  canvas: HTMLCanvasElement,
  provider: Provider | undefined,
  onStatus?: (s: string) => void,
): Promise<string | null> {
  if (!HOSTED_OCR_ENABLED) return null;

  try {
    const image = await prepareHostedOcrImage(canvas);
    if (!image) return null;

    onStatus?.('Reading the reference with online OCR…');
    const form = new FormData();
    form.set('file', image, 'receipt.jpg');
    if (provider) form.set('provider', provider);

    const response = await fetch('/api/ocr', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;

    const body = (await response.json().catch(() => null)) as {
      success?: boolean;
      data?: { reference?: string | null };
    } | null;
    const reference = body?.success ? body.data?.reference?.trim() : null;
    return reference || null;
  } catch {
    return null;
  }
}

async function tryDecodeQr(img: HTMLImageElement): Promise<string | null> {
  const jsQR = await getJsQr();
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

/** OCR a canvas and hunt for a payment reference in the recognised text */
export async function ocrCanvasForReference(
  canvas: HTMLCanvasElement,
  provider?: Provider,
): Promise<string | null> {
  const worker = await getOcrWorker();
  const {
    data: { text },
  } = await worker.recognize(canvas);
  return findReferenceInText(text, provider);
}

/**
 * Extract a verifiable reference from a receipt photo.
 * Order: QR code → hosted OCR (when configured) → on-device OCR. A QR that decodes but holds an app-only
 * payload (e.g. telebirr's in-app receipt QR, which only the telebirr
 * SuperApp can verify) falls through to OCR of the printed reference.
 */
export async function extractReceiptData(
  file: File,
  onStatus?: (s: string) => void,
  options: ExtractionOptions = {},
): Promise<ExtractionResult | null> {
  // Shared receipts are often PDFs (e.g. Dashen SuperApp's downloaded receipt).
  // A digital PDF carries real text, so read the reference straight from it —
  // no photo, no OCR — and fall back to rendering pages for QR/OCR if needed.
  if (isPdf(file)) return extractFromPdf(file, onStatus, options);

  onStatus?.('Looking for the QR code…');
  const img = await loadImage(file);

  const qr = await tryDecodeQr(img);
  if (qr && findReceiptReference(qr)) return { input: qr, source: 'qr' };

  const canvas = drawToCanvas(img, 2000);
  const hostedRef = await tryHostedOcr(canvas, options.provider, onStatus);
  if (hostedRef) return { input: hostedRef, source: 'ocrspace' };

  onStatus?.('Trying on-device OCR…');
  const ref = await ocrCanvasForReference(canvas, options.provider);
  if (ref) return { input: ref, source: 'ocr' };

  return null;
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

/**
 * Extract a reference from a receipt PDF. Tries, in order:
 *   1. the embedded text layer (digital PDFs — exact, no OCR),
 *   2. a QR code rendered from the first page,
 *   3. hosted OCR, then on-device OCR of the rendered page (scanned PDFs).
 */
async function extractFromPdf(
  file: File,
  onStatus?: (s: string) => void,
  options: ExtractionOptions = {},
): Promise<ExtractionResult | null> {
  onStatus?.('Reading the receipt PDF…');
  const pdfjs = await import('pdfjs-dist');
  // Parse off the main thread — the bundler emits the worker as a static
  // asset via the import.meta.url pattern, so nothing needs hosting manually.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;

  try {
    // 1. Embedded text — join every page's text and hunt for the reference
    let allText = '';
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      allText += content.items.map((i) => ('str' in i ? i.str : '')).join(' ') + '\n';
    }
    const fromText = findReferenceInText(allText, options.provider);
    if (fromText) return { input: fromText, source: 'ocr' };

    // 2 & 3. Render the first page and try QR, then OCR (scanned PDFs)
    onStatus?.('Scanning the receipt image…');
    const canvas = await renderPdfPage(doc, 1);
    if (canvas) {
      const jsQR = await getJsQr();
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(data.data, data.width, data.height);
      if (code?.data?.trim() && findReceiptReference(code.data.trim())) {
        return { input: code.data.trim(), source: 'qr' };
      }
      const hostedRef = await tryHostedOcr(canvas, options.provider, onStatus);
      if (hostedRef) return { input: hostedRef, source: 'ocrspace' };

      onStatus?.('Trying on-device OCR…');
      const ref = await ocrCanvasForReference(canvas, options.provider);
      if (ref) return { input: ref, source: 'ocr' };
    }
    return null;
  } finally {
    await doc.destroy();
  }
}

async function renderPdfPage(
  doc: Awaited<ReturnType<Awaited<typeof import('pdfjs-dist')>['getDocument']>['promise']>,
  pageNum: number,
): Promise<HTMLCanvasElement | null> {
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  await page.render({ canvas, canvasContext: ctx, viewport } as Parameters<typeof page.render>[0]).promise;
  return canvas;
}
