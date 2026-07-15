// ============================================
// Dashen Bank (SuperApp) receipt QR resolution
//
// Dashen SuperApp receipt QRs encode a token of the form
//   superappreceipt_<id>.<verifier>
// resolved by Dashen's hosted receipt service. The public receipt URL seen in
// the wild is https://api.dashensuperapp.com/receipts/<token>.
//
// The exact response contract is not publicly documented and the host is
// Ethiopian-hosted (unreachable from many networks), so this resolver:
//   - tries several id/host forms,
//   - extracts fields defensively across likely key spellings,
//   - and, when it can't map a record, surfaces a compact diagnostic of what
//     the API actually returned so the field mapping can be finalised from a
//     real scan. Set DASHEN_DEBUG=false to silence the diagnostic.
// ============================================

import { VERIFICATION_CONFIG } from '@/lib/constants';
import { createErrorResult } from '@/lib/verifier-api';
import { maskReference } from '@/lib/crypto';
import type { NormalizedVerificationResult } from '@/types';

const DASHEN_DEBUG = process.env.DASHEN_DEBUG !== 'false';

interface Attempt {
  url: string;
  status: number | 'network-error' | 'timeout';
  contentType: string;
  bodySnippet: string;
}

/**
 * Resolve a Dashen SuperApp receipt token to a verification result.
 * `token` is the full `superappreceipt_<id>.<verifier>` string from the QR.
 */
export async function resolveDashenReceipt(token: string): Promise<NormalizedVerificationResult> {
  // token = superappreceipt_<id>.<verifier>
  const afterPrefix = token.replace(/^superappreceipt_/i, '');
  const id = afterPrefix.split('.')[0] ?? afterPrefix;

  // api.dashensuperapp.com/receipts/<key> fronts an S3 bucket ("receiptprod").
  // The raw token is NOT the stored object key — the object is keyed by the
  // token with a file extension (the SuperApp writes a JSON/PDF blob). Try the
  // likely key forms; S3 returns the object body directly on a hit.
  const base = 'https://api.dashensuperapp.com/receipts';
  const candidates = [
    `${base}/${encodeURIComponent(token)}.json`,
    `${base}/${encodeURIComponent(token)}/data.json`,
    `${base}/${encodeURIComponent(id)}.json`,
    `${base}/${encodeURIComponent(token)}.pdf`,
    `${base}/${encodeURIComponent(id)}.pdf`,
    `${base}/${encodeURIComponent(token)}`,
  ];

  const attempts: Attempt[] = [];

  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
          Referer: 'https://www.dashensuperapp.com/',
        },
        signal: AbortSignal.timeout(VERIFICATION_CONFIG.apiTimeoutMs),
      });

      const contentType = response.headers.get('content-type') ?? '';
      const text = await response.text();
      attempts.push({ url, status: response.status, contentType, bodySnippet: text.slice(0, 400) });

      if (!response.ok) continue;
      if (!/json/i.test(contentType) && !looksLikeJson(text)) continue;

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        continue;
      }

      const result = normalizeDashen(token, unwrap(json));
      if (result) return result;
      // Parsed JSON but couldn't find a reference — record and keep trying
    } catch (error) {
      const name = (error as Error)?.name;
      attempts.push({
        url,
        status: name === 'AbortError' || name === 'TimeoutError' ? 'timeout' : 'network-error',
        contentType: '',
        bodySnippet: (error as Error)?.message?.slice(0, 120) ?? '',
      });
    }
  }

  // Nothing resolved. In debug mode, surface what the API actually returned so
  // the real contract can be wired up from a live scan. 404s are the S3
  // "NoSuchKey" XML (known) — collapse those to just the key ending, and show
  // the full body only for any non-404 response worth reading.
  if (DASHEN_DEBUG) {
    const diag = attempts
      .map((a) => {
        const key = keyEnding(a.url);
        if (a.status === 404) return `${key}→404`;
        return `${key}→${a.status}${a.contentType ? `(${a.contentType.split(';')[0]})` : ''}: ${a.bodySnippet.replace(/\s+/g, ' ').trim()}`;
      })
      .join('  |  ');
    return createErrorResult('DASHEN', token, 'NOT_FOUND', `Dashen lookup diagnostic — ${diag || 'no responses'}`.slice(0, 900));
  }

  return createErrorResult('DASHEN', token, 'NOT_FOUND', 'Dashen does not recognise this receipt. The QR code may be invalid or the receipt may have expired.');
}

function normalizeDashen(token: string, data: unknown): NormalizedVerificationResult | null {
  const reference = extract(data, ['reference', 'referenceNo', 'reference_no', 'transactionReference', 'transactionId', 'transaction_id', 'txnId', 'receiptNumber', 'traceNumber', 'id']);
  const amount = extractNumber(data, ['amount', 'transactionAmount', 'transaction_amount', 'debitAmount', 'totalAmount', 'value']);
  // Require at least a reference or an amount to consider this a real record
  if (reference == null && amount == null) return null;
  const ref = (reference ?? token).toUpperCase();

  return {
    provider: 'DASHEN',
    verificationStatus: 'VERIFIED',
    transactionStatus: normalizeStatus(extract(data, ['status', 'transactionStatus', 'state'])),
    reference: ref,
    referenceMasked: maskReference(ref),
    payerName: extract(data, ['payerName', 'payer_name', 'senderName', 'sender_name', 'debitAccountHolder', 'from', 'payer']),
    recipientName: extract(data, ['recipientName', 'recipient_name', 'receiverName', 'receiver_name', 'creditAccountHolder', 'to', 'receiver', 'recipientNumber']),
    recipientAccount: extract(data, ['recipientAccount', 'recipient_account', 'receiverAccount', 'receiver_account', 'recipientNumber', 'creditAccountNo', 'creditAccount']),
    recipientAccountMasked: null,
    amount,
    currency: extract(data, ['currency', 'currencyCode']) ?? 'ETB',
    transactionDate: extract(data, ['date', 'transactionDate', 'transaction_date', 'paymentDate', 'createdAt', 'timestamp']),
    receiptNumber: ref,
    description: extract(data, ['reason', 'description', 'narrative', 'serviceType', 'service_type', 'paymentReason']),
    fees: extractNumber(data, ['fee', 'fees', 'serviceCharge', 'service_charge', 'charge', 'totalFees']),
    rawResponse: (data ?? {}) as Record<string, unknown>,
  };
}

function looksLikeJson(text: string): boolean {
  const t = text.trim();
  return t.startsWith('{') || t.startsWith('[');
}

// The distinguishing part of a candidate URL: what comes after the token id,
// e.g. ".json", "/data.json", ".pdf", or "" (raw). Lets the diagnostic show
// which key form was tried without repeating the long token each time.
function keyEnding(url: string): string {
  const m = url.match(/receipts\/(.*)$/);
  if (!m) return url;
  const key = decodeURIComponent(m[1]);
  // strip the known token/id prefix so only the distinguishing tail remains
  const tail = key.replace(/^superappreceipt_[a-z0-9]+(\.[a-z0-9]+)?/i, '').replace(/^[a-z0-9]{16,}/i, '');
  return tail || '<raw>';
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// The API may wrap the record in { data } / { result } / { receipt } / { body:[…] }
function unwrap(json: any): any {
  if (json == null || typeof json !== 'object') return json;
  if (Array.isArray(json)) return json[0] ?? json;
  if (Array.isArray(json.body)) return json.body[0] ?? json;
  return json.data ?? json.result ?? json.receipt ?? json.transaction ?? json;
}

function extract(data: any, keys: string[]): string | null {
  if (!data || typeof data !== 'object') return null;
  for (const key of keys) {
    const v = data[key];
    if (v != null && v !== '' && typeof v !== 'object') return String(v);
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
