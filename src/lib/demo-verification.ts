// ============================================
// Live verification for demo mode
// Calls the real Verifier API (Vixen878/verifier-api) without a database.
// Used when DEMO_MODE=true but VERIFIER_API_KEY is configured, so the
// deployed demo performs real receipt verification end-to-end.
// ============================================

import { VERIFIER_API_KEY } from '@/lib/constants';
import { verifyByReference, verifyUniversal } from '@/lib/verifier-api';
import { resolveCbeReceipt } from '@/lib/cbe-receipt';
import { resolveBoaReceipt } from '@/lib/boa-receipt';
import { resolveDashenReceipt } from '@/lib/dashen-receipt';
import type { Provider, ResultLevel, NormalizedVerificationResult } from '@/types';

export function hasLiveVerifier(): boolean {
  return VERIFIER_API_KEY.length > 0;
}

interface LiveDemoInput {
  provider?: Provider;
  reference: string;
  suffix?: string;
  phoneNumber?: string;
  expectedAmount?: number;
  receiptToken?: string;
}

export async function performLiveDemoVerification(input: LiveDemoInput) {
  const start = Date.now();
  // Hosted receipt tokens (CBE mbreciept / BoA slip / Dashen SuperApp) resolve
  // against the bank's own public API — no Verifier API key needed.
  const apiResult = input.receiptToken
    ? input.provider === 'ABYSSINIA'
      ? await resolveBoaReceipt(input.receiptToken)
      : input.provider === 'DASHEN'
        ? await resolveDashenReceipt(input.receiptToken)
        : await resolveCbeReceipt(input.receiptToken)
    : input.provider
      ? await verifyByReference(input.provider, input.reference, input.suffix, input.phoneNumber)
      : await verifyUniversal(input.reference, input.suffix, input.phoneNumber);
  return toVerificationResult(apiResult, input.expectedAmount, start);
}

function toVerificationResult(
  apiResult: NormalizedVerificationResult,
  expectedAmount: number | undefined,
  startTime: number,
) {
  const amountMatches =
    expectedAmount != null && apiResult.amount != null
      ? Math.abs(apiResult.amount - expectedAmount) < 0.01
      : null;

  const { resultLevel, resultReason } = classify(apiResult, amountMatches);

  return {
    id: `demo-v-${Date.now()}`,
    provider: apiResult.provider,
    verificationStatus: apiResult.verificationStatus,
    transactionStatus: apiResult.transactionStatus,
    resultLevel,
    resultReason,
    referenceMasked: apiResult.referenceMasked,
    payerName: apiResult.payerName,
    recipientName: apiResult.recipientName,
    recipientAccountMasked: apiResult.recipientAccountMasked ?? maskAccount(apiResult.recipientAccount),
    recipientMatches: null, // No registered accounts in demo mode
    amountMatches,
    expectedAmount: expectedAmount ?? null,
    verifiedAmount: apiResult.amount,
    currency: apiResult.currency,
    isDuplicate: false, // No history in demo mode
    duplicateInfo: null,
    transactionDate: apiResult.transactionDate,
    receiptNumber: apiResult.receiptNumber,
    fees: apiResult.fees,
    apiDescription: apiResult.description,
    processingTimeMs: Date.now() - startTime,
    createdAt: new Date().toISOString(),
  };
}

function classify(
  apiResult: NormalizedVerificationResult,
  amountMatches: boolean | null,
): { resultLevel: ResultLevel; resultReason: string } {
  if (['ERROR', 'TIMEOUT', 'UNSUPPORTED'].includes(apiResult.verificationStatus)) {
    return {
      resultLevel: 'YELLOW',
      resultReason: apiResult.description || 'Unable to verify at this time. Please try again later.',
    };
  }

  if (apiResult.verificationStatus === 'NOT_FOUND') {
    return {
      resultLevel: 'YELLOW',
      resultReason:
        apiResult.description?.startsWith('Dashen lookup diagnostic')
          ? apiResult.description
          : 'Transaction reference not found. The reference may be incorrect or the provider system may be delayed.',
    };
  }

  if (apiResult.transactionStatus && !['SUCCESS', 'UNKNOWN'].includes(apiResult.transactionStatus)) {
    return {
      resultLevel: 'RED',
      resultReason: `Payment was ${apiResult.transactionStatus.toLowerCase()}. This transaction did not complete successfully.`,
    };
  }

  if (apiResult.verificationStatus === 'INVALID') {
    return {
      resultLevel: 'RED',
      resultReason: 'The payment provider could not confirm this transaction. The receipt may be invalid or altered.',
    };
  }

  if (amountMatches === false && apiResult.amount != null) {
    return {
      resultLevel: 'RED',
      resultReason: `Amount mismatch detected: the verified transaction amount (${apiResult.amount.toFixed(2)} ETB) does not match the expected amount.`,
    };
  }

  return {
    resultLevel: 'GREEN',
    resultReason:
      amountMatches === null
        ? 'Payment verified against the provider. Confirm the amount and transaction time shown below match what the customer paid.'
        : 'Payment verified successfully against the provider.',
  };
}

function maskAccount(account: string | null): string | null {
  if (!account) return null;
  return account.length > 4 ? `****${account.slice(-4)}` : account;
}
