// ============================================
// Dashen Bank (SuperApp) receipt QR resolution
//
// Dashen SuperApp receipt QRs encode a token of the form
//   superappreceipt_<id>.<verifier>
// which the official viewer at https://www.dashensuperapp.com/receipts/<token>
// resolves against Dashen's hosted receipt API. We call that API directly to
// pull the authoritative transaction record. No Verifier API key involved.
//
// The API host (api.dashensuperapp.com) is Ethiopian-hosted and geo-restricted,
// so field extraction is defensive: the exact JSON shape is not publicly
// documented, and we normalise across the likely key spellings the way the
// CBE/Verifier layers do.
// ============================================

import { VERIFICATION_CONFIG } from '@/lib/constants';
import { createErrorResult } from '@/lib/verifier-api';
import { maskReference } from '@/lib/crypto';
import type { NormalizedVerificationResult } from '@/types';

// The receipt token's hosted API. The viewer fetches the same path the token
// is embedded in; both the API host and the www viewer accept the full token.
const DASHEN_RECEIPT_ENDPOINTS = [
  'https://api.dashensuperapp.com/receipts/',
  'https://www.dashensuperapp.com/api/receipts/',
];

/**
 * Resolve a Dashen SuperApp receipt token to a verification result.
 * `token` is the full `superappreceipt_<id>.<verifier>` string from the QR.
 */
export async function resolveDashenReceipt(token: string): Promise<NormalizedVerificationResult> {
  let lastStatus = 0;
  for (const base of DASHEN_RECEIPT_ENDPOINTS) {
    try {
      const response = await fetch(`${base}${encodeURIComponent(token)}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
          Referer: 'https://www.dashensuperapp.com/',
        },
        signal: AbortSignal.timeout(VERIFICATION_CONFIG.apiTimeoutMs),
      });

      if (response.status === 404) {
        return createErrorResult('DASHEN', token, 'NOT_FOUND', 'Dashen does not recognise this receipt. The QR code may be invalid or the receipt may have expired.');
      }
      if (!response.ok) {
        lastStatus = response.status;
        continue; // try the next host
      }

      // Guard against the viewer's HTML shell being served instead of JSON
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('json')) {
        lastStatus = response.status;
        continue;
      }

      const data = unwrap(await response.json());
      const reference = extract(data, ['reference', 'referenceNo', 'reference_no', 'transactionReference', 'transactionId', 'transaction_id', 'txnId', 'receiptNumber', 'traceNumber']) ?? token;

      return {
        provider: 'DASHEN',
        verificationStatus: 'VERIFIED',
        transactionStatus: normalizeStatus(extract(data, ['status', 'transactionStatus', 'state'])),
        reference: reference.toUpperCase(),
        referenceMasked: maskReference(reference),
        payerName: extract(data, ['payerName', 'payer_name', 'senderName', 'sender_name', 'debitAccountHolder', 'from', 'payer']),
        recipientName: extract(data, ['recipientName', 'recipient_name', 'receiverName', 'receiver_name', 'creditAccountHolder', 'to', 'receiver']),
        recipientAccount: extract(data, ['recipientAccount', 'recipient_account', 'receiverAccount', 'receiver_account', 'recipientNumber', 'creditAccountNo', 'creditAccount']),
        recipientAccountMasked: null,
        amount: extractNumber(data, ['amount', 'transactionAmount', 'transaction_amount', 'debitAmount', 'totalAmount', 'value']),
        currency: extract(data, ['currency', 'currencyCode']) ?? 'ETB',
        transactionDate: extract(data, ['date', 'transactionDate', 'transaction_date', 'paymentDate', 'createdAt', 'timestamp']),
        receiptNumber: reference.toUpperCase(),
        description: extract(data, ['reason', 'description', 'narrative', 'serviceType', 'service_type', 'paymentReason']),
        fees: extractNumber(data, ['fee', 'fees', 'serviceCharge', 'service_charge', 'charge', 'totalFees']),
        rawResponse: (data ?? {}) as Record<string, unknown>,
      };
    } catch (error) {
      const name = (error as Error)?.name;
      if (name === 'AbortError' || name === 'TimeoutError') {
        return createErrorResult('DASHEN', token, 'TIMEOUT', 'Dashen receipt lookup timed out. The bank service may be temporarily unavailable — try again in a moment.');
      }
      // network error — try the next host
    }
  }

  return createErrorResult(
    'DASHEN',
    token,
    'ERROR',
    lastStatus
      ? `Dashen receipt lookup failed (${lastStatus}). Please try again.`
      : 'Unable to reach the Dashen receipt service. Please try again.',
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// The API may wrap the record in { data } / { result } / { receipt } / { body:[…] }
function unwrap(json: any): any {
  if (json == null || typeof json !== 'object') return json;
  if (Array.isArray(json.body)) return json.body[0] ?? json;
  return json.data ?? json.result ?? json.receipt ?? json.transaction ?? json;
}

function extract(data: any, keys: string[]): string | null {
  if (!data || typeof data !== 'object') return null;
  for (const key of keys) {
    const v = data[key];
    if (v != null && v !== '') return String(v);
  }
  return null;
}

function extractNumber(data: any, keys: string[]): number | null {
  const v = extract(data, keys);
  if (v === null) return null;
  const num = parseFloat(v.replace(/[^0-9.]/g, ''));
  return isNaN(num) ? null : num;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function normalizeStatus(status: string | null): NormalizedVerificationResult['transactionStatus'] {
  if (!status) return 'SUCCESS'; // hosted receipts are posted transactions
  const s = status.toUpperCase();
  if (['SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'COMPLETE', 'POSTED', 'APPROVED'].includes(s)) return 'SUCCESS';
  if (['FAILED', 'FAILURE', 'DECLINED', 'REJECTED'].includes(s)) return 'FAILED';
  if (['PENDING', 'PROCESSING'].includes(s)) return 'PENDING';
  if (['CANCELLED', 'CANCELED', 'REVERSED'].includes(s)) return 'CANCELLED';
  return 'UNKNOWN';
}
