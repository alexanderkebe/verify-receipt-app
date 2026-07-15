// ============================================
// Bank of Abyssinia receipt QR resolution
//
// BoA's mobile-app receipt QR encodes an AES-encrypted CSV of the whole
// transaction — not a URL. The official slip viewer decrypts it with a
// hard-coded key (shipped in its client bundle) and renders the fields.
// We do the same: decrypt on the server and read the transaction directly.
//
// This is self-authenticating — only BoA's key produces a valid
// AES-CBC/PKCS7 decryption whose plaintext is a well-formed BoA receipt CSV,
// so a tampered or fake QR fails to decrypt or fails the shape check. No
// external API call is needed (BoA's public getDetails endpoint only accepts
// the encrypted token anyway, and sits behind a flaky WAF).
//
// Plaintext CSV layout (7 comma-separated fields):
//   sourceAccount, payerName, amount, reference, "DD/MM/YYYY  HH:MM:SS",
//   receiverAccount, receiverName
// ============================================

import { createDecipheriv, pbkdf2Sync } from 'crypto';
import { createErrorResult } from '@/lib/verifier-api';
import { maskReference } from '@/lib/crypto';
import type { NormalizedVerificationResult } from '@/types';

// Constants lifted verbatim from cs.bankofabyssinia.com/slip's bundle:
//   PBKDF2(passphrase, "salt", { keySize: 256/32, iterations: 1e4, SHA1 })
//   AES-CBC, iv "1234567890123456", PKCS7 padding.
const BOA_PASSPHRASE = 'ELqVy2g4pGWLUIKSa+1ijwpPy6eDxBFBLBPrJ24v/IA=';
const BOA_SALT = Buffer.from('salt', 'utf8');
const BOA_IV = Buffer.from('1234567890123456', 'utf8');
const BOA_KEY = pbkdf2Sync(Buffer.from(BOA_PASSPHRASE, 'utf8'), BOA_SALT, 10000, 32, 'sha1');

export interface BoaReceiptFields {
  sourceAccount: string;
  payerName: string;
  amount: number | null;
  reference: string;
  transactionDate: string | null; // ISO
  receiverAccount: string;
  receiverName: string;
}

/**
 * Decrypt a BoA receipt QR payload (base64 ciphertext). Returns null when the
 * text is not a valid BoA-encrypted receipt (wrong key, tampered, or not a
 * BoA QR at all).
 */
export function decryptBoaReceipt(payload: string): BoaReceiptFields | null {
  const trimmed = payload.trim();
  // Must be plausible base64 of a whole AES block-aligned ciphertext
  if (!/^[A-Za-z0-9+/]{40,}={0,2}$/.test(trimmed)) return null;

  let plaintext: string;
  try {
    const decipher = createDecipheriv('aes-256-cbc', BOA_KEY, BOA_IV);
    plaintext = decipher.update(Buffer.from(trimmed, 'base64'), undefined, 'utf8') + decipher.final('utf8');
  } catch {
    return null; // bad padding / wrong key → not a genuine BoA QR
  }

  const parts = plaintext.split(',');
  // Genuine payloads have 7 fields; require the reference to look like an FT ref
  if (parts.length < 7) return null;
  const [sourceAccount, payerName, amount, reference, dateStr, receiverAccount, ...nameParts] = parts.map((p) => p.trim());
  if (!/^FT[A-Z0-9]{6,}/i.test(reference)) return null;

  return {
    sourceAccount,
    payerName,
    amount: parseAmount(amount),
    reference: reference.toUpperCase(),
    transactionDate: toIsoDate(dateStr),
    receiverAccount,
    receiverName: nameParts.join(',').trim(),
  };
}

/**
 * Resolve a scanned BoA receipt QR payload to a verification result by
 * decrypting it on-device. Async to match the other resolvers' signatures.
 */
export async function resolveBoaReceipt(payload: string): Promise<NormalizedVerificationResult> {
  const fields = decryptBoaReceipt(payload);
  if (!fields) {
    return createErrorResult(
      'ABYSSINIA',
      payload.slice(0, 24),
      'NOT_FOUND',
      'This QR could not be verified as a genuine Bank of Abyssinia receipt. It may be invalid, tampered with, or from another provider.',
    );
  }

  return {
    provider: 'ABYSSINIA',
    verificationStatus: 'VERIFIED',
    transactionStatus: 'SUCCESS',
    reference: fields.reference,
    referenceMasked: maskReference(fields.reference),
    payerName: fields.payerName || null,
    recipientName: fields.receiverName || null,
    recipientAccount: fields.receiverAccount || null,
    recipientAccountMasked: fields.receiverAccount || null,
    amount: fields.amount,
    currency: 'ETB',
    transactionDate: fields.transactionDate,
    receiptNumber: fields.reference,
    description: null,
    fees: null, // the QR CSV carries only the transferred amount
    rawResponse: { source: 'boa-qr', ...fields },
  };
}

function parseAmount(value: string | undefined): number | null {
  if (!value) return null;
  const num = parseFloat(value.replace(/[^0-9.]/g, ''));
  return isNaN(num) ? null : num;
}

/** BoA dates come as "DD/MM/YYYY  HH:MM:SS" — convert so Date() parses them. */
function toIsoDate(value: string | undefined): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})[, ]+(\d{2}:\d{2}(?::\d{2})?)/);
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}` : value;
}
