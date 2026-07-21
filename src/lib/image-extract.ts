// ============================================
// On-device receipt extraction (client-side only)
// Reads the QR code or reference number out of a receipt
// photo in the browser. The image itself is never uploaded —
// only the extracted reference/link is sent for verification.
// ============================================

import { findReceiptReference } from '@/lib/receipt-input';

export interface ExtractionResult {
  /** The text to verify: a receipt URL (from QR) or a bare reference */
  input: string;
  source: 'qr' | 'ocr';
}

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

/** Find a payment reference in OCR'd / PDF-extracted receipt text */
export function findReferenceInText(text: string): string | null {
  const cleaned = text.replace(/[^\x20-\x7E\n]/g, ' ');

  // CBE receipt URL printed as text
  const url = cleaned.match(/https?:\/\/\S*cbe\.com\.et\S*/i);
  if (url) return url[0];

  // CBE reference: FT + 10 alphanumerics (allow trailing suffix digits)
  const ft = cleaned.match(/\bFT[A-Z0-9]{10}(?:[0-9]{8})?\b/i);
  if (ft) return ft[0].toUpperCase();

  // Dashen "Transaction Reference" specifically (prefer it over the longer
  // "Transfer Reference" printed just below on the same receipt).
  const dashenLabelled = cleaned.match(/Transaction\s+Reference\s*:?\s*([0-9A-Z]{10,20})/i);
  if (dashenLabelled) return dashenLabelled[1].toUpperCase();

  // Dashen reference shape on a receipt, e.g. 132WDTS26196000H or
  // 878WDTS252330002 — digits, an embedded letter run, digits, optional
  // trailing letter.
  const dashen = cleaned.match(/\b[0-9]{2,4}[A-Z]{2,6}[0-9]{6,14}[A-Z]?\b/);
  if (dashen) return dashen[0].toUpperCase();

  // Labelled reference/receipt number (Telebirr, M-Pesa, Dashen…)
  const labelled = cleaned.match(
    /(?:reference|receipt|transaction|invoice)\s*(?:no|number|id)?\s*(?:\([^)]*\))?\s*[.:#]?\s+([A-Z0-9]{8,20})\b/i,
  );
  if (labelled && /[0-9]/.test(labelled[1])) return labelled[1].toUpperCase();

  return null;
}

/** OCR a canvas and hunt for a payment reference in the recognised text */
export async function ocrCanvasForReference(canvas: HTMLCanvasElement): Promise<string | null> {
  const worker = await getOcrWorker();
  const {
    data: { text },
  } = await worker.recognize(canvas);
  return findReferenceInText(text);
}

/**
 * Extract a verifiable reference from a receipt photo, entirely on-device.
 * Order: QR code → OCR text. A QR that decodes but holds an app-only
 * payload (e.g. telebirr's in-app receipt QR, which only the telebirr
 * SuperApp can verify) falls through to OCR of the printed reference.
 */
export async function extractReceiptData(
  file: File,
  onStatus?: (s: string) => void,
): Promise<ExtractionResult | null> {
  // Shared receipts are often PDFs (e.g. Dashen SuperApp's downloaded receipt).
  // A digital PDF carries real text, so read the reference straight from it —
  // no photo, no OCR — and fall back to rendering pages for QR/OCR if needed.
  if (isPdf(file)) return extractFromPdf(file, onStatus);

  onStatus?.('Looking for the QR code…');
  const img = await loadImage(file);

  const qr = await tryDecodeQr(img);
  if (qr && findReceiptReference(qr)) return { input: qr, source: 'qr' };

  onStatus?.('Reading the reference number from the photo…');
  const ref = await ocrCanvasForReference(drawToCanvas(img, 2000));
  if (ref) return { input: ref, source: 'ocr' };

  return null;
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

/**
 * Extract a reference from a receipt PDF on-device. Tries, in order:
 *   1. the embedded text layer (digital PDFs — exact, no OCR),
 *   2. a QR code rendered from the first page,
 *   3. OCR of the rendered page (scanned PDFs).
 */
async function extractFromPdf(
  file: File,
  onStatus?: (s: string) => void,
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
    const fromText = findReferenceInText(allText);
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
      const ref = await ocrCanvasForReference(canvas);
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
