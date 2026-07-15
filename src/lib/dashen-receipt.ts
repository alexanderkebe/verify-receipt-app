// ============================================
// Dashen Bank (SuperApp) receipt resolution
//
// Dashen publishes a public, server-rendered receipt page at
//   https://receipts.dashenbanksc.com/receipt/<transactionReference>
// keyed by the plain transaction reference (e.g. 132WDTS26196000H) — NOT by
// the in-app QR token. Every field is rendered as HTML text server-side (no
// auth, no client JS), so we fetch it and parse the fields directly.
//
// The scanned success-screen QR holds an app-internal token that no public
// endpoint resolves, so Dashen receipts are verified from their reference
// (read off the shared PDF or typed) rather than the QR.
// ============================================

import { VERIFICATION_CONFIG } from '@/lib/constants';
import { createErrorResult } from '@/lib/verifier-api';
import { maskReference } from '@/lib/crypto';
import type { NormalizedVerificationResult } from '@/types';

const DASHEN_RECEIPT_BASE = 'https://receipts.dashenbanksc.com/receipt';

/**
 * Resolve a Dashen transaction reference to a verification result by fetching
 * its public receipt page. `reference` is the plain transaction reference
 * (e.g. 132WDTS26196000H), not the in-app QR token.
 */
export async function resolveDashenReceipt(reference: string): Promise<NormalizedVerificationResult> {
  const ref = reference.trim().toUpperCase();
  try {
    const response = await fetch(`${DASHEN_RECEIPT_BASE}/${encodeURIComponent(ref)}`, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
      },
      signal: AbortSignal.timeout(VERIFICATION_CONFIG.apiTimeoutMs),
    });

    if (response.status === 404) {
      return createErrorResult('DASHEN', ref, 'NOT_FOUND', 'Dashen does not recognise this receipt reference. Check the reference or upload the shared receipt PDF.');
    }
    if (!response.ok) {
      return createErrorResult('DASHEN', ref, 'ERROR', `Dashen receipt lookup failed (${response.status}). Please try again.`);
    }

    const html = await response.text();
    const fields = parseDashenReceiptHtml(html);

    // The page renders even for unknown refs; require the core fields to treat
    // it as a genuine receipt.
    if (!fields.reference && fields.amount == null && !fields.payerName) {
      return createErrorResult('DASHEN', ref, 'NOT_FOUND', 'No transaction found for this Dashen reference.');
    }

    const finalRef = (fields.reference ?? ref).toUpperCase();
    return {
      provider: 'DASHEN',
      verificationStatus: 'VERIFIED',
      transactionStatus: 'SUCCESS', // the public page only serves posted transactions
      reference: finalRef,
      referenceMasked: maskReference(finalRef),
      payerName: fields.payerName,
      recipientName: fields.receiverName,
      recipientAccount: fields.receiverAccount,
      recipientAccountMasked: fields.receiverAccount, // already masked by Dashen
      amount: fields.amount,
      currency: 'ETB',
      transactionDate: fields.transactionDate,
      receiptNumber: finalRef,
      description: fields.narrative ?? fields.serviceType,
      fees: fields.totalCharge,
      rawResponse: { source: 'dashen-receipt-page', ...fields },
    };
  } catch (error) {
    const name = (error as Error)?.name;
    if (name === 'AbortError' || name === 'TimeoutError') {
      return createErrorResult('DASHEN', ref, 'TIMEOUT', 'Dashen receipt lookup timed out. Please try again in a moment.');
    }
    return createErrorResult('DASHEN', ref, 'ERROR', 'Unable to reach the Dashen receipt service. Please try again.');
  }
}

interface DashenReceiptFields {
  payerName: string | null;
  senderAccount: string | null;
  receiverName: string | null;
  receiverAccount: string | null;
  reference: string | null;
  transferReference: string | null;
  serviceType: string | null;
  narrative: string | null;
  transactionDate: string | null;
  amount: number | null;
  totalCharge: number | null;
}

/**
 * Parse Dashen's server-rendered receipt HTML. Fields are printed as
 *   <p><strong>Label:</strong> value</p>
 * and the amounts as a two-column <tr><td>Label</td><td>ETB n.nn</td></tr>.
 */
export function parseDashenReceiptHtml(html: string): DashenReceiptFields {
  const label = (name: string): string | null => {
    // <strong>Sender Name:</strong> Abel …  (tolerate whitespace / trailing space in the label)
    const re = new RegExp(`${escapeRe(name)}\\s*:?\\s*</strong>\\s*([^<]+)`, 'i');
    const m = html.match(re);
    return m ? decodeEntities(m[1]).trim() || null : null;
  };
  const money = (name: string): number | null => {
    // <td>Transaction Amount</td> <td>ETB 10.00</td>
    const re = new RegExp(`<td>\\s*${escapeRe(name)}\\s*</td>\\s*<td>\\s*(?:ETB)?\\s*([0-9,]+(?:\\.[0-9]+)?)`, 'i');
    const m = html.match(re);
    if (!m) return null;
    const num = parseFloat(m[1].replace(/,/g, ''));
    return isNaN(num) ? null : num;
  };

  return {
    payerName: label('Sender Name'),
    senderAccount: label('Sender Account Number'),
    receiverName: label('Receiver Name'),
    receiverAccount: label('Receiver Account Number'),
    reference: label('Transaction Reference'),
    transferReference: label('Transfer Reference'),
    serviceType: label('Service Type'),
    narrative: label('Narrative'),
    transactionDate: normalizeDate(label('Transaction Date')),
    amount: money('Transaction Amount') ?? money('Total'),
    totalCharge: money('Service Charge'),
  };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// Dashen prints dates like "Jul 15, 2026, 05:43:10 pm" — leave as-is if it
// doesn't match (Date can still parse the printed form).
function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value.replace(/\s+(am|pm)$/i, (m) => m.toUpperCase()));
  return isNaN(parsed.getTime()) ? value : parsed.toISOString();
}
