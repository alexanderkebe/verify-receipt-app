// ============================================
// Bridge to the web app's receipt-parsing rules.
//
// `findReceiptReference` lives in ../../src/lib/receipt-input.ts and is
// dependency-free TypeScript (its only import is a type). Metro is configured
// to watch the repo root (see metro.config.js), so both clients run the exact
// same parsing logic — a QR that works on the web works here.
// ============================================

export { findReceiptReference, type ParsedReceiptInput } from '@shared/lib/receipt-input';

import type { Provider } from '@/api/endpoints';

export const PROVIDERS: Provider[] = [
  'CBE',
  'TELEBIRR',
  'DASHEN',
  'ABYSSINIA',
  'CBE_BIRR',
  'MPESA',
];

export const PROVIDER_LABELS: Record<Provider, string> = {
  CBE: 'Commercial Bank of Ethiopia',
  TELEBIRR: 'telebirr',
  DASHEN: 'Dashen Bank',
  ABYSSINIA: 'Bank of Abyssinia',
  CBE_BIRR: 'CBE Birr',
  MPESA: 'M-Pesa',
};

export const PROVIDER_SHORT_LABELS: Record<Provider, string> = {
  CBE: 'CBE',
  TELEBIRR: 'telebirr',
  DASHEN: 'Dashen',
  ABYSSINIA: 'Abyssinia',
  CBE_BIRR: 'CBE Birr',
  MPESA: 'M-Pesa',
};

/**
 * Providers whose receipt QR codes resolve against a public endpoint.
 * Telebirr and Dashen QRs are app-internal payloads that nothing outside
 * their own app can verify — those flows use manual entry or a photo.
 * Mirrors QR_SCANNER_PROVIDERS in the web's VerifyForm.
 */
export const QR_SCANNER_PROVIDERS = new Set<Provider>(['CBE', 'CBE_BIRR', 'ABYSSINIA']);

export const PROVIDER_HELP_TEXTS: Record<Provider, string> = {
  CBE: 'Enter the 12-digit transaction reference starting with FT (e.g. FT24123ABCDE) or paste a CBE receipt link.',
  TELEBIRR: 'Enter the 10-digit alphanumeric transaction ID (e.g. DG61L8C6XB) or paste a telebirr receipt link.',
  DASHEN: 'Enter the Dashen Bank transaction reference number.',
  ABYSSINIA: 'Enter the Bank of Abyssinia transaction reference number.',
  CBE_BIRR: 'Enter the CBE Birr receipt number.',
  MPESA: 'Enter the M-Pesa receipt number.',
};

export const PROVIDER_PLACEHOLDERS: Record<Provider, string> = {
  CBE: 'e.g. FT24123ABCDE',
  TELEBIRR: 'e.g. DG61L8C6XB',
  DASHEN: 'e.g. DS987654321',
  ABYSSINIA: 'e.g. AB12345678',
  CBE_BIRR: 'e.g. CB12345678',
  MPESA: 'e.g. MP12345678',
};

/** Guidance shown when a scanned QR turns out to be app-only. */
export function appOnlyQrMessage(provider: Provider | null): string {
  if (provider === 'TELEBIRR') {
    return 'This is a telebirr in-app QR — it can only be verified inside the telebirr app. Take a photo of the receipt or type the transaction number instead.';
  }
  if (provider === 'DASHEN') {
    return 'This is a Dashen SuperApp in-app QR. In Dashen, tap Share on the receipt to save the PDF, then type the reference printed on it.';
  }
  return 'Could not read a receipt reference from this QR code. Type the reference manually or take a photo of the receipt instead.';
}
