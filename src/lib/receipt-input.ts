// ============================================
// Receipt input parsing
// Accepts a bare reference number or a receipt URL
// (CBE / Telebirr QR links) and extracts the pieces
// the Verifier API needs. Provider is left undefined
// when unknown — the API's universal /verify endpoint
// auto-detects it.
// ============================================

import type { Provider } from '@/types';

export interface ParsedReceiptInput {
  provider?: Provider;
  reference: string;
  suffix?: string;
}

export function parseVerificationInput(raw: string): ParsedReceiptInput {
  const input = raw.trim();

  // CBE receipt URL, e.g. https://apps.cbe.com.et:100/?id=FT26123ABC1212345678
  // The id is the 12-char FT reference with the 8-digit account suffix appended.
  const cbe = input.match(/cbe\.com\.et[^?]*\?.*?id=([A-Za-z0-9]+)/i);
  if (cbe) {
    const id = cbe[1];
    if (/^FT/i.test(id) && id.length > 12) {
      return { provider: 'CBE', reference: id.slice(0, 12).toUpperCase(), suffix: id.slice(12) };
    }
    return { provider: 'CBE', reference: id.toUpperCase() };
  }

  // Telebirr receipt URL, e.g. https://transactioninfo.ethiotelecom.et/receipt/CEK3PN0PJ0
  const tb = input.match(/ethiotelecom\.et\/(?:receipt\/)?([A-Za-z0-9]+)\s*$/i);
  if (tb) {
    return { provider: 'TELEBIRR', reference: tb[1].toUpperCase() };
  }

  // Any other URL — take an id-like query param or the last path segment
  if (/^https?:\/\//i.test(input)) {
    try {
      const url = new URL(input);
      for (const name of ['id', 'ref', 'reference', 'receipt', 'receiptno', 'trx', 'transactionid']) {
        const v = url.searchParams.get(name);
        if (v && /^[A-Za-z0-9]{6,40}$/.test(v)) return { reference: v.toUpperCase() };
      }
      const seg = url.pathname.split('/').filter(Boolean).pop();
      if (seg && /^[A-Za-z0-9]{6,40}$/.test(seg)) return { reference: seg.toUpperCase() };
    } catch {
      // fall through to raw handling
    }
  }

  // Bare reference — FT prefix is a CBE reference; everything else is
  // left to the universal endpoint to detect.
  const reference = input.toUpperCase();
  if (/^FT[A-Z0-9]{10}[0-9]{8}$/.test(reference)) {
    // Reference pasted together with the 8-digit suffix (as in CBE QR ids)
    return { provider: 'CBE', reference: reference.slice(0, 12), suffix: reference.slice(12) };
  }
  if (/^FT/.test(reference)) {
    return { provider: 'CBE', reference };
  }
  return { reference };
}
