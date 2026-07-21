import type { Provider } from '@/types';

/**
 * Find a payment reference in OCR or PDF-extracted receipt text.
 *
 * The provider is only a parsing hint. Every returned value is still sent to
 * the provider verification API; OCR output is never treated as proof of a
 * successful payment.
 */
export function findReferenceInText(text: string, provider?: Provider): string | null {
  const cleaned = text.replace(/[^\x20-\x7E\n]/g, ' ');

  if (!provider || provider === 'CBE') {
    const url = cleaned.match(/https?:\/\/\S*cbe\.com\.et\S*/i);
    if (url) return url[0];

    const ft = cleaned.match(/\bFT[A-Z0-9]{10}(?:[0-9]{8})?\b/i);
    if (ft) return ft[0].toUpperCase();
  }

  if (!provider || provider === 'DASHEN') {
    const labelled = cleaned.match(/Transaction\s+Reference\s*:?\s*([0-9A-Z]{10,20})/i);
    if (labelled) return labelled[1].toUpperCase();

    const shaped = cleaned.match(/\b[0-9]{2,4}[A-Z]{2,6}[0-9]{6,14}[A-Z]?\b/);
    if (shaped) return shaped[0].toUpperCase();
  }

  const labelled = cleaned.match(
    /(?:reference|receipt|transaction|invoice)\s*(?:no|number|id)?\s*(?:\([^)]*\))?\s*[.:#]?\s+([A-Z0-9]{8,20})\b/i,
  );
  if (labelled && /[0-9]/.test(labelled[1])) {
    const reference = labelled[1].toUpperCase();
    if (/^FT/.test(reference) && provider && provider !== 'CBE' && provider !== 'ABYSSINIA') {
      return null;
    }
    return reference;
  }

  return null;
}
