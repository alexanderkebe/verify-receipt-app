// ============================================
// CBE hosted receipt resolution
// New-format CBE mobile-banking QR codes encode a hosted receipt URL
// (https://mbreciept.cbe.com.et/<token>) instead of the FT reference.
// The receipt viewer at that URL loads the transaction from CBE's public
// API — we call the same API to resolve the token straight to the
// authoritative transaction record. No Verifier API (or key) involved.
// ============================================

import { VERIFICATION_CONFIG } from '@/lib/constants';
import { createErrorResult } from '@/lib/verifier-api';
import { maskReference } from '@/lib/crypto';
import type { NormalizedVerificationResult } from '@/types';

const CBE_RECEIPT_API = 'https://mb.cbe.com.et/api/v1/transactions/public/transaction-detail';

// Static identifiers the official receipt viewer sends with every request
// (public — they ship in the viewer's client bundle).
const CBE_RECEIPT_HEADERS = {
  'X-App-ID': 'd1292e42-7400-49de-a2d3-9731caa4c819',
  'X-App-Version': '0a01980b-9859-1369-8198-59f403820000',
};

/** Fields of the transaction-detail response this app reads. */
interface CbeTransactionDetail {
  id?: string; // the FT reference, e.g. FT26195B842W
  debitAccountHolder?: string;
  creditAccountHolder?: string;
  creditAccountNo?: string; // masked by CBE, e.g. 1********7915
  amountCredited?: string;
  totalChargeAmount?: string;
  dateTimes?: string[];
  paymentDetails?: string[];
  debitTheirRef?: string;
}

/**
 * Resolve a hosted-receipt token to a verification result using CBE's
 * public transaction-detail API.
 */
export async function resolveCbeReceipt(token: string): Promise<NormalizedVerificationResult> {
  try {
    const response = await fetch(`${CBE_RECEIPT_API}/${encodeURIComponent(token)}`, {
      method: 'GET',
      headers: CBE_RECEIPT_HEADERS,
      signal: AbortSignal.timeout(VERIFICATION_CONFIG.apiTimeoutMs),
    });

    if (!response.ok) {
      // CBE reports bad tokens as 500 with a problem+json body, e.g.
      // { detail: "Security Alert: Invalid V2 token!" }
      const problem = (await response.json().catch(() => ({}))) as { detail?: string; message?: string };
      if (response.status === 404 || /invalid|token/i.test(problem.detail ?? '')) {
        return createErrorResult('CBE', token, 'NOT_FOUND', 'CBE does not recognise this receipt. The QR code may be invalid or tampered with.');
      }
      return createErrorResult('CBE', token, 'ERROR', `CBE receipt lookup failed (${problem.detail || response.status}). Please try again.`);
    }

    const data = (await response.json()) as CbeTransactionDetail;
    const reference = (data.id ?? '').toUpperCase() || token;
    const amount = parseAmount(data.amountCredited);

    return {
      provider: 'CBE',
      verificationStatus: 'VERIFIED',
      // The public receipt API only serves posted (completed) transactions
      transactionStatus: 'SUCCESS',
      reference,
      referenceMasked: maskReference(reference),
      payerName: data.debitAccountHolder ?? null,
      recipientName: data.creditAccountHolder ?? null,
      recipientAccount: data.creditAccountNo ?? null,
      recipientAccountMasked: data.creditAccountNo ?? null, // already masked by CBE
      amount,
      currency: 'ETB',
      transactionDate: data.dateTimes?.[0] ?? null,
      receiptNumber: reference,
      description: data.paymentDetails?.[0] ?? data.debitTheirRef ?? null,
      fees: parseAmount(data.totalChargeAmount),
      rawResponse: data as Record<string, unknown>,
    };
  } catch (error) {
    const name = (error as Error)?.name;
    if (name === 'AbortError' || name === 'TimeoutError') {
      return createErrorResult('CBE', token, 'TIMEOUT', 'CBE receipt lookup timed out. The bank service may be temporarily unavailable — try again in a moment.');
    }
    return createErrorResult('CBE', token, 'ERROR', 'Unable to reach the CBE receipt service. Please try again.');
  }
}

function parseAmount(value: string | undefined): number | null {
  if (!value) return null;
  const num = parseFloat(value.replace(/[^0-9.]/g, ''));
  return isNaN(num) ? null : num;
}
