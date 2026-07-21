const OCR_SPACE_ENDPOINT = 'https://api.ocr.space/parse/image';
const DEFAULT_TIMEOUT_MS = 10_000;

export class HostedOcrError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'HostedOcrError';
  }
}

interface OcrSpacePayload {
  ParsedResults?: Array<{
    ParsedText?: string | null;
    ErrorMessage?: string | null;
    ErrorDetails?: string | null;
  }>;
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[] | null;
  ErrorDetails?: string | null;
  ProcessingTimeInMilliseconds?: string | number;
}

export interface HostedOcrResult {
  text: string;
  processingTimeMs: number | null;
}

export function isHostedOcrConfigured(): boolean {
  return process.env.OCR_FALLBACK_ENABLED === 'true' && Boolean(process.env.OCR_SPACE_API_KEY);
}

export function parseOcrSpaceResponse(payload: unknown): HostedOcrResult {
  if (!payload || typeof payload !== 'object') {
    throw new HostedOcrError('OCR service returned an invalid response');
  }

  const data = payload as OcrSpacePayload;
  const text = (data.ParsedResults ?? [])
    .map((result) => result.ParsedText?.trim() ?? '')
    .filter(Boolean)
    .join('\n');

  if (data.IsErroredOnProcessing && !text) {
    const message = Array.isArray(data.ErrorMessage)
      ? data.ErrorMessage.join('; ')
      : data.ErrorMessage || data.ErrorDetails || 'OCR processing failed';
    throw new HostedOcrError(String(message));
  }

  const rawTime = Number(data.ProcessingTimeInMilliseconds);
  return {
    text,
    processingTimeMs: Number.isFinite(rawTime) ? rawTime : null,
  };
}

export async function recognizeWithOcrSpace(file: File): Promise<HostedOcrResult> {
  const apiKey = process.env.OCR_SPACE_API_KEY;
  if (!isHostedOcrConfigured() || !apiKey) {
    throw new HostedOcrError('Online OCR is not configured', 503);
  }

  const requestBody = new FormData();
  requestBody.set('file', file, file.name || 'receipt.jpg');
  requestBody.set('language', 'eng');
  requestBody.set('OCREngine', '2');
  requestBody.set('detectOrientation', 'true');
  requestBody.set('isOverlayRequired', 'false');
  requestBody.set('isTable', 'true');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(OCR_SPACE_ENDPOINT, {
        method: 'POST',
        headers: { apikey: apiKey },
        body: requestBody,
        cache: 'no-store',
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });

      if (response.status === 429) {
        throw new HostedOcrError('Online OCR quota is temporarily unavailable', 429);
      }
      if (!response.ok) {
        const retryable = response.status >= 500;
        if (retryable && attempt === 0) continue;
        throw new HostedOcrError('Online OCR service is unavailable', 502, retryable);
      }

      return parseOcrSpaceResponse(await response.json());
    } catch (error) {
      if (error instanceof HostedOcrError) throw error;
      if (attempt === 0) continue;
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new HostedOcrError(
        timedOut ? 'Online OCR timed out' : 'Could not reach the online OCR service',
        502,
        true,
      );
    }
  }

  throw new HostedOcrError('Online OCR service is unavailable');
}
