import { NextRequest } from 'next/server';
import { requireBusiness, fail, handleError, ok } from '@/lib/api-helpers';
import { consumeOcrQuota } from '@/lib/ocr-rate-limit';
import {
  HostedOcrError,
  isHostedOcrConfigured,
  recognizeWithOcrSpace,
} from '@/lib/ocr-space';
import { findReferenceInText } from '@/lib/receipt-text';
import { PROVIDER_LABELS, type Provider } from '@/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;

const MAX_FILE_BYTES = 1_000_000;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png']);

function isProvider(value: string): value is Provider {
  return Object.prototype.hasOwnProperty.call(PROVIDER_LABELS, value);
}

function hasValidSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireBusiness();
    if (!isHostedOcrConfigured()) return fail('Online OCR is not configured', 503);

    const quota = consumeOcrQuota(ctx.businessId);
    if (!quota.allowed) {
      const response = fail('Online OCR is busy; using on-device OCR instead', 429);
      response.headers.set('Retry-After', String(quota.retryAfterSeconds));
      return response;
    }

    const form = await req.formData();
    const upload = form.get('file');
    const providerValue = String(form.get('provider') ?? '');
    const provider = isProvider(providerValue) ? providerValue : undefined;

    if (!(upload instanceof File)) return fail('Receipt image is required');
    if (!ALLOWED_TYPES.has(upload.type)) return fail('Only JPEG and PNG receipt images are allowed');
    if (upload.size === 0 || upload.size > MAX_FILE_BYTES) {
      return fail('Receipt image must be smaller than 1 MB');
    }

    const bytes = new Uint8Array(await upload.arrayBuffer());
    if (!hasValidSignature(bytes, upload.type)) return fail('Receipt image format is invalid');

    const result = await recognizeWithOcrSpace(upload);
    const reference = findReferenceInText(result.text, provider);
    return ok({
      reference,
      source: 'ocrspace' as const,
      processingTimeMs: result.processingTimeMs,
    });
  } catch (error) {
    if (error instanceof HostedOcrError) return fail(error.message, error.status);
    return handleError(error);
  }
}
