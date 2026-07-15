// ============================================
// Bank of Abyssinia hosted receipt resolution
// BoA receipt QR codes encode a hosted slip URL
// (https://cs.bankofabyssinia.com/slip/?trx=<token>). The slip page loads
// the transaction from BoA's public API — we call the same API to resolve
// the token straight to the authoritative transaction record.
// No Verifier API (or key) involved.
// ============================================

import { VERIFICATION_CONFIG } from '@/lib/constants';
import { createErrorResult } from '@/lib/verifier-api';
import { maskReference } from '@/lib/crypto';
import type { NormalizedVerificationResult } from '@/types';

const BOA_RECEIPT_API = 'https://cs.bankofabyssinia.com/api/onlineSlip/getDetails/';

/** BoA's slip API returns human-readable keys, e.g. "Source Account Name". */
interface BoaSlipRecord {
  "Payer's Name"?: string;
  'Source Account'?: string;
  'Source Account Name'?: string;
  "Receiver's Account"?: string;
  "Receiver's Name"?: string;
  'Transferred Amount'?: string;
  'Total Amount including VAT'?: string;
  'Service Charge'?: string;
  'VAT (15%)'?: string;
  'Transaction Reference'?: string;
  'Transaction Date'?: string;
  'Transaction Type'?: string;
  currency?: string;
}

/**
 * Resolve a slip token (the `trx` query value from the receipt QR) to a
 * verification result using BoA's public slip API.
 *
 * BoA's endpoint sits behind a flaky WAF that intermittently drops
 * connections, so transient failures get one retry before giving up.
 */
export async function resolveBoaReceipt(token: string): Promise<NormalizedVerificationResult> {
  try {
    let response: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
      try {
        response = await fetch(`${BOA_RECEIPT_API}?id=${encodeURIComponent(token)}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            // Look like the official slip page — BoA's WAF is picky
            'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
            Referer: 'https://cs.bankofabyssinia.com/slip/',
          },
          signal: AbortSignal.timeout(VERIFICATION_CONFIG.apiTimeoutMs),
        });
        if (response.ok || response.status < 500) break;
      } catch (err) {
        const name = (err as Error)?.name;
        // A timeout consumed the whole time budget — don't retry
        if (name === 'AbortError' || name === 'TimeoutError') throw err;
        if (attempt === 1) throw err;
        response = null;
      }
    }

    if (!response || !response.ok) {
      return createErrorResult('ABYSSINIA', token, 'ERROR', `Bank of Abyssinia receipt lookup failed${response ? ` (${response.status})` : ''}. Please try again.`);
    }

    const data = (await response.json()) as { body?: BoaSlipRecord[] };
    const record = data.body?.[0];

    // Unknown references come back as { "Payer's Name": "Invalid reference number" }
    if (!record || !record['Transaction Reference']) {
      return createErrorResult('ABYSSINIA', token, 'NOT_FOUND', 'Bank of Abyssinia does not recognise this receipt. The QR code may be invalid or tampered with.');
    }

    const reference = record['Transaction Reference'].toUpperCase();

    return {
      provider: 'ABYSSINIA',
      verificationStatus: 'VERIFIED',
      // The slip API only serves posted (completed) transactions
      transactionStatus: 'SUCCESS',
      reference,
      referenceMasked: maskReference(reference),
      payerName: record['Source Account Name'] ?? record["Payer's Name"] ?? null,
      recipientName: record["Receiver's Name"] ?? null,
      recipientAccount: record["Receiver's Account"] ?? null,
      recipientAccountMasked: record["Receiver's Account"] ?? null, // already masked by BoA
      amount: parseAmount(record['Transferred Amount']),
      currency: record.currency || 'ETB',
      transactionDate: toIsoDate(record['Transaction Date']),
      receiptNumber: reference,
      description: record['Transaction Type'] ?? null,
      fees: sumAmounts(record['Service Charge'], record['VAT (15%)']),
      rawResponse: record as Record<string, unknown>,
    };
  } catch (error) {
    const name = (error as Error)?.name;
    if (name === 'AbortError' || name === 'TimeoutError') {
      return createErrorResult('ABYSSINIA', token, 'TIMEOUT', 'Bank of Abyssinia receipt lookup timed out. The bank service may be temporarily unavailable — try again in a moment.');
    }
    return createErrorResult('ABYSSINIA', token, 'ERROR', 'Unable to reach the Bank of Abyssinia receipt service. Please try again.');
  }
}

function parseAmount(value: string | undefined): number | null {
  if (!value) return null;
  const num = parseFloat(value.replace(/[^0-9.]/g, ''));
  return isNaN(num) ? null : num;
}

function sumAmounts(...values: Array<string | undefined>): number | null {
  const nums = values.map(parseAmount).filter((n): n is number => n !== null);
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100;
}

/** BoA dates come as "15/07/2026, 14:04:20" — convert so Date() parses them. */
function toIsoDate(value: string | undefined): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})[, ]+(\d{2}:\d{2}(?::\d{2})?)/);
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}` : value;
}
