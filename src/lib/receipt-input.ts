// ============================================
// Receipt input parsing
// Accepts a bare reference number, a receipt URL, or the raw
// contents of a receipt QR code (which may embed the reference
// inside an app-specific payload). Extracts the pieces the
// Verifier API needs. Provider is left undefined when unknown —
// the API's universal /verify endpoint auto-detects it.
// ============================================

import type { Provider } from '@/types';

export interface ParsedReceiptInput {
  provider?: Provider;
  reference: string;
  suffix?: string;
  /** Opaque token from a hosted receipt URL (CBE mbreciept / BoA slip QR) —
   *  resolved directly against the bank's own public receipt API. */
  receiptToken?: string;
  /** True when the provider is implied by the input itself (a bank receipt
   *  URL). Bare FT references are ambiguous (CBE and BoA both use them), so
   *  without this flag the user's provider selection should win. */
  providerCertain?: boolean;
}

/**
 * Try hard to pull a verifiable receipt reference out of arbitrary text
 * (a bare ref, a receipt URL, or a QR payload with the ref embedded).
 * Returns null when nothing reference-like can be found.
 */
export function findReceiptReference(raw: string): ParsedReceiptInput | null {
  const input = raw.trim();
  if (!input) return null;

  // New-format CBE mobile-banking QR: a hosted receipt URL, e.g.
  // https://mbreciept.cbe.com.et/v2-hfHCxzXoYDFuPxv0bhBg
  // ("reciept" is CBE's own spelling — accept both.) The path is an opaque
  // token that CBE's public receipt API resolves to the full transaction.
  const cbeHosted = input.match(/mbrec(?:ie|ei)pt\.cbe\.com\.et(?::\d+)?\/([A-Za-z0-9_-]{8,64})/i);
  if (cbeHosted) {
    return { provider: 'CBE', reference: cbeHosted[1], receiptToken: cbeHosted[1], providerCertain: true };
  }

  // Bank of Abyssinia receipt QR: the app's receipt QR is an AES-encrypted
  // CSV of the transaction (base64 ciphertext), not a URL. It's decrypted
  // server-side (see boa-receipt.ts) — here we just recognise the shape and
  // pass the payload through as the token. Older BoA receipts use a hosted
  // slip URL with the same ciphertext in a `trx` param, so accept both.
  const boaFromUrl = input.match(/bankofabyssinia\.com[^?#]*[?&]trx=([^&#\s]+)/i);
  const boaPayload = boaFromUrl ? safeDecodeURIComponent(boaFromUrl[1]) : input;
  if (looksLikeBoaCipher(boaPayload)) {
    return {
      provider: 'ABYSSINIA',
      // Provisional display value until the server decrypts the real ref
      reference: 'BOA-RECEIPT',
      receiptToken: boaPayload,
      providerCertain: true,
    };
  }

  // Dashen Bank (SuperApp) receipt QR. The QR encodes a token like
  //   superappreceipt_<id>.<verifier>
  // (sometimes wrapped in a https://…dashensuperapp.com/receipts/<token> URL).
  // Resolved server-side against Dashen's hosted receipt API.
  const dashenUrl = input.match(/dashensuperapp\.com\/receipts?\/([^/?#\s]+)/i);
  const dashenToken = dashenUrl ? safeDecodeURIComponent(dashenUrl[1]) : input;
  if (/^superappreceipt_[A-Za-z0-9]+\.[A-Za-z0-9]+$/i.test(dashenToken)) {
    return {
      provider: 'DASHEN',
      // Provisional display value until the server resolves the real ref
      reference: 'DASHEN-RECEIPT',
      receiptToken: dashenToken,
      providerCertain: true,
    };
  }

  // CBE receipt URL, e.g. https://apps.cbe.com.et:100/?id=FT26123ABC1212345678
  // The id is the 12-char FT reference with the 8-digit account suffix appended.
  const cbeUrl = input.match(/cbe\.com\.et[^?]*\?[^#]*\bid=([A-Za-z0-9]+)/i);
  if (cbeUrl) {
    const id = cbeUrl[1].toUpperCase();
    if (/^FT/.test(id) && id.length > 12) {
      return { provider: 'CBE', reference: id.slice(0, 12), suffix: id.slice(12), providerCertain: true };
    }
    return { provider: 'CBE', reference: id, providerCertain: true };
  }

  // Telebirr / ethiotelecom receipt URL, anywhere in the payload
  // e.g. https://transactioninfo.ethiotelecom.et/receipt/CEK3PN0PJ0
  const tbUrl = input.match(/ethiotelecom\.et\/(?:[a-z]+\/)?([A-Za-z0-9]{6,20})/i);
  if (tbUrl) {
    return { provider: 'TELEBIRR', reference: tbUrl[1].toUpperCase(), providerCertain: true };
  }

  // Any other URL — take an id-like query param or the last path segment
  if (/^https?:\/\//i.test(input)) {
    try {
      const url = new URL(input);
      for (const name of ['id', 'ref', 'reference', 'receipt', 'receiptno', 'receiptNo', 'trx', 'transactionid', 'transactionId', 'tn']) {
        const v = url.searchParams.get(name);
        if (v && /^[A-Za-z0-9]{6,40}$/.test(v)) return normalizeBare(v);
      }
      const seg = url.pathname.split('/').filter(Boolean).pop();
      if (seg && /^[A-Za-z0-9]{6,40}$/.test(seg)) return normalizeBare(seg);
    } catch {
      // fall through
    }
  }

  const upper = input.toUpperCase();

  // CBE FT reference with the 8-digit suffix appended
  const ftFull = upper.match(/FT[A-Z0-9]{10}[0-9]{8}/);
  if (ftFull) return { provider: 'CBE', reference: ftFull[0].slice(0, 12), suffix: ftFull[0].slice(12) };

  // CBE FT reference on its own
  const ft = upper.match(/FT[A-Z0-9]{10}/);
  if (ft) return { provider: 'CBE', reference: ft[0] };

  // The whole input is a clean bare reference
  if (/^[A-Z0-9]{6,20}$/.test(upper)) return normalizeBare(upper);

  // Telebirr-style reference embedded in a larger QR payload (deep link,
  // JSON, or labelled text). Telebirr refs are ~10 chars starting with
  // letters and mixing in digits, e.g. DG61L8C6XB / CEK3PN0PJ0.
  const delimited = upper.match(/[A-Z0-9]{8,14}/g);
  if (delimited) {
    const shaped = delimited.find(
      (t) => /^[A-Z]{2,4}[A-Z0-9]+$/.test(t) && /[0-9]/.test(t) && t.length >= 9 && t.length <= 12,
    );
    if (shaped) return { provider: 'TELEBIRR', reference: shaped };
  }

  return null;
}

/**
 * Cheap client-side gate: does this look like a BoA-encrypted receipt QR?
 * (base64 whose decoded length is a whole number of AES blocks). The actual
 * proof is the server-side decryption in boa-receipt.ts — this only routes
 * the payload there and must not fire on ordinary references or URLs.
 */
function looksLikeBoaCipher(value: string): boolean {
  const s = value.trim();
  // Pure base64, no URL/query/whitespace, and long enough to be a full record.
  // BoA's QR text carries no padding, so validate the decoded byte count
  // (must be a whole number of 16-byte AES-CBC blocks) rather than the
  // raw string length.
  if (!/^[A-Za-z0-9+/]{80,}={0,2}$/.test(s)) return false;
  const unpadded = s.replace(/=+$/, '').length;
  const bytes = Math.floor((unpadded * 3) / 4);
  // A valid base64 group leaves remainder 0, 2, or 3 chars (never 1)
  if (unpadded % 4 === 1) return false;
  return bytes >= 16 && bytes % 16 === 0; // AES-CBC ciphertext is block-aligned
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeBare(value: string): ParsedReceiptInput {
  const ref = value.toUpperCase();
  if (/^FT[A-Z0-9]{10}[0-9]{8}$/.test(ref)) {
    return { provider: 'CBE', reference: ref.slice(0, 12), suffix: ref.slice(12) };
  }
  if (/^FT/.test(ref)) return { provider: 'CBE', reference: ref };
  return { reference: ref };
}

/**
 * Server-side helper: always returns something to send to the API,
 * falling back to the raw (trimmed, upper-cased) input.
 */
export function parseVerificationInput(raw: string): ParsedReceiptInput {
  return findReceiptReference(raw) ?? { reference: raw.trim().toUpperCase() };
}
