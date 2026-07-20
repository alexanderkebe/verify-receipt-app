// ============================================
// Verifier API Integration Layer
// Handles all communication with Vixen878/verifier-api
// ============================================

import { unstable_cache } from 'next/cache';
import { VERIFIER_API_BASE_URL, VERIFIER_API_KEY, PROVIDER_ENDPOINTS, VERIFICATION_CONFIG } from '@/lib/constants';
import type { Provider, NormalizedVerificationResult, VerificationStatus, TransactionStatus } from '@/types';

// ---- Circuit Breaker State ----
interface CircuitState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

const circuitBreakers: Record<string, CircuitState> = {};

function getCircuit(provider: string): CircuitState {
  if (!circuitBreakers[provider]) {
    circuitBreakers[provider] = { failures: 0, lastFailure: 0, isOpen: false };
  }
  return circuitBreakers[provider];
}

function recordFailure(provider: string): void {
  const circuit = getCircuit(provider);
  circuit.failures++;
  circuit.lastFailure = Date.now();
  if (circuit.failures >= VERIFICATION_CONFIG.circuitBreakerThreshold) {
    circuit.isOpen = true;
  }
}

function recordSuccess(provider: string): void {
  const circuit = getCircuit(provider);
  circuit.failures = 0;
  circuit.isOpen = false;
}

function isCircuitOpen(provider: string): boolean {
  const circuit = getCircuit(provider);
  if (!circuit.isOpen) return false;
  // Check if reset period has passed
  if (Date.now() - circuit.lastFailure > VERIFICATION_CONFIG.circuitBreakerResetMs) {
    circuit.isOpen = false;
    circuit.failures = 0;
    return false;
  }
  return true;
}

// ---- API Health Check ----
export async function checkApiHealth(): Promise<{ healthy: boolean; responseTime: number }> {
  const start = Date.now();
  try {
    const response = await fetch(`${VERIFIER_API_BASE_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return {
      healthy: response.ok,
      responseTime: Date.now() - start,
    };
  } catch {
    return { healthy: false, responseTime: Date.now() - start };
  }
}

/**
 * Health check cached for 60s — the admin overview and monitoring surfaces
 * all render it, and each uncached call costs up to a 5s external round trip.
 * The verify-page health endpoint stays on the uncached checkApiHealth.
 */
export const getCachedApiHealth = unstable_cache(checkApiHealth, ['verifier-health'], {
  revalidate: 60,
});

// ---- Provider-Specific Verification ----
export async function verifyByReference(
  provider: Provider,
  reference: string,
  suffix?: string,
  phoneNumber?: string,
): Promise<NormalizedVerificationResult> {
  // Circuit breaker check
  if (isCircuitOpen(provider)) {
    return createErrorResult(provider, reference, 'TIMEOUT', 'Service temporarily unavailable. Please try again shortly.');
  }

  const endpoint = PROVIDER_ENDPOINTS[provider];
  if (!endpoint) {
    return createErrorResult(provider, reference, 'UNSUPPORTED', `Provider ${provider} is not supported`);
  }

  // Build request body based on provider
  const body = buildRequestBody(provider, reference, suffix, phoneNumber);

  // Call with retry
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= VERIFICATION_CONFIG.maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        await delay(VERIFICATION_CONFIG.retryDelayMs * attempt);
      }

      const response = await fetch(`${VERIFIER_API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': VERIFIER_API_KEY,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(VERIFICATION_CONFIG.apiTimeoutMs),
      });

      if (response.ok) {
        const data = await response.json();
        recordSuccess(provider);
        return normalizeResponse(provider, reference, data);
      }

      if (response.status === 401 || response.status === 403) {
        return createErrorResult(provider, reference, 'ERROR', 'Authentication failed with verification service');
      }

      if (response.status === 404) {
        recordSuccess(provider);
        return createErrorResult(provider, reference, 'NOT_FOUND', 'Transaction reference not found');
      }

      if (response.status === 429) {
        return createErrorResult(provider, reference, 'ERROR', 'Rate limit exceeded. Please try again later.');
      }

      // Server error — retry
      if (response.status >= 500) {
        lastError = new Error(`Server error: ${response.status}`);
        continue;
      }

      // Other client errors
      const errorData = await response.json().catch(() => ({}));
      return createErrorResult(
        provider,
        reference,
        'ERROR',
        (errorData as { message?: string }).message || `Verification failed (${response.status})`
      );
    } catch (error) {
      lastError = error as Error;
      if ((error as Error).name === 'AbortError' || (error as Error).name === 'TimeoutError') {
        // A timeout already consumed the whole time budget — don't retry
        recordFailure(provider);
        return createErrorResult(provider, reference, 'TIMEOUT', 'Verification timed out. The payment provider may be temporarily unavailable — try again in a moment.');
      }
    }
  }

  recordFailure(provider);
  return createErrorResult(
    provider,
    reference,
    'ERROR',
    lastError?.message || 'Unable to verify at this time'
  );
}

// ---- Universal Verification ----
export async function verifyUniversal(
  reference: string,
  suffix?: string,
  phoneNumber?: string,
): Promise<NormalizedVerificationResult> {
  const body: Record<string, string> = { reference };
  if (suffix) body.suffix = suffix;
  if (phoneNumber) body.phone = phoneNumber;

  try {
    const response = await fetch(`${VERIFIER_API_BASE_URL}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': VERIFIER_API_KEY,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(VERIFICATION_CONFIG.apiTimeoutMs),
    });

    if (response.ok) {
      const data = await response.json();
      const provider = detectProvider(data, reference);
      return normalizeResponse(provider, reference, data);
    }

    if (response.status === 404) {
      return createErrorResult('CBE', reference, 'NOT_FOUND', 'Transaction reference not found');
    }

    return createErrorResult('CBE', reference, 'ERROR', 'Verification failed');
  } catch (error) {
    return createErrorResult(
      'CBE',
      reference,
      'TIMEOUT',
      (error as Error)?.name === 'AbortError'
        ? 'Verification timed out'
        : 'Unable to connect to verification service'
    );
  }
}

// ---- Helpers ----

function buildRequestBody(
  provider: Provider,
  reference: string,
  suffix?: string,
  phoneNumber?: string,
): Record<string, string> {
  const body: Record<string, string> = { reference };

  switch (provider) {
    case 'CBE':
      // The dedicated endpoint expects `accountSuffix` (last 8 digits);
      // `suffix` is included as well for older API versions.
      if (suffix) {
        body.accountSuffix = suffix;
        body.suffix = suffix;
      }
      break;
    case 'ABYSSINIA':
      if (suffix) {
        body.accountSuffix = suffix;
        body.suffix = suffix;
      }
      break;
    case 'CBE_BIRR':
      body.receipt = reference;
      if (phoneNumber) body.phone = phoneNumber;
      break;
    case 'MPESA':
      body.reference = reference;
      break;
    default:
      // TELEBIRR, DASHEN — reference only
      break;
  }

  return body;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function normalizeResponse(
  provider: Provider,
  reference: string,
  data: any,
): NormalizedVerificationResult {
  // The Verifier API returns different formats per provider
  // This normalizes them into a consistent internal model

  const isSuccess = determineSuccess(data);
  const txStatus = determineTransactionStatus(data);

  const recipientAccount = extractField(data, [
    'creditedPartyAccountNo',
    'creditedPartyAccount',
    'receiverTelebirrNo',
    'receiverAccount',
    'receiver_account',
    'recipientAccount',
    'recipient_account',
    'creditedAccount',
  ]);

  return {
    provider,
    verificationStatus: isSuccess ? 'VERIFIED' : 'INVALID',
    transactionStatus: txStatus,
    reference,
    referenceMasked: maskRef(reference),
    payerName: extractField(data, ['payerName', 'payer_name', 'senderName', 'sender_name', 'from', 'payer']),
    recipientName: extractField(data, ['receiverName', 'receiver_name', 'recipientName', 'recipient_name', 'creditedPartyName', 'to', 'receiver']),
    recipientAccount,
    recipientAccountMasked: maskAccount(recipientAccount),
    amount: extractNumber(data, ['amount', 'settledAmount', 'settled_amount', 'transactionAmount', 'transaction_amount', 'totalAmount']),
    currency: 'ETB',
    transactionDate: extractField(data, ['date', 'transactionDate', 'transaction_date', 'paymentDate', 'payment_date', 'createdAt']),
    receiptNumber: extractField(data, ['receiptNo', 'receiptNumber', 'receipt_number', 'transactionRef', 'transaction_ref', 'referenceNumber']),
    description: extractField(data, ['description', 'reason', 'narrative', 'paymentReason', 'payment_reason']),
    fees: extractNumber(data, ['serviceFee', 'fee', 'fees', 'serviceCharge', 'service_charge', 'totalFees']),
    rawResponse: data,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
function determineSuccess(data: any): boolean {
  if (data.success === true || data.verified === true || data.data?.success === true) return true;

  const statuses = [
    data.status,
    data.transactionStatus,
    data.data?.status,
    data.data?.transactionStatus,
    data.result?.status,
    data.result?.transactionStatus,
  ];

  return statuses.some((status) => {
    if (status === true) return true;
    const normalized = String(status ?? '').trim().toUpperCase();
    return ['SUCCESS', 'SUCCESSFUL', 'COMPLETED'].includes(normalized);
  });
}

function determineTransactionStatus(data: any): TransactionStatus {
  const status = data.transactionStatus || data.status || data.data?.status;
  if (!status) return 'UNKNOWN';
  const normalized = String(status).toUpperCase();
  if (['SUCCESS', 'COMPLETED', 'SUCCESSFUL'].includes(normalized)) return 'SUCCESS';
  if (['FAILED', 'FAILURE', 'DECLINED'].includes(normalized)) return 'FAILED';
  if (['PENDING', 'PROCESSING'].includes(normalized)) return 'PENDING';
  if (['CANCELLED', 'CANCELED', 'REVERSED'].includes(normalized)) return 'CANCELLED';
  return 'UNKNOWN';
}

function extractField(data: any, keys: string[]): string | null {
  for (const key of keys) {
    if (data[key] != null && data[key] !== '') return String(data[key]);
    if (data.data && data.data[key] != null && data.data[key] !== '') return String(data.data[key]);
    if (data.result && data.result[key] != null && data.result[key] !== '') return String(data.result[key]);
  }
  return null;
}

function extractNumber(data: any, keys: string[]): number | null {
  const value = extractField(data, keys);
  if (value === null) return null;
  const num = parseFloat(value.replace(/[^0-9.]/g, ''));
  return isNaN(num) ? null : num;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function detectProvider(data: Record<string, unknown>, reference?: string): Provider {
  const providerHint = String(data.provider || data.bank || data.service || '').toUpperCase();
  if (providerHint.includes('CBE') && !providerHint.includes('BIRR')) return 'CBE';
  if (providerHint.includes('TELEBIRR')) return 'TELEBIRR';
  if (providerHint.includes('DASHEN')) return 'DASHEN';
  if (providerHint.includes('ABYSSINIA')) return 'ABYSSINIA';
  if (providerHint.includes('CBE BIRR') || providerHint.includes('CBEBIRR')) return 'CBE_BIRR';
  if (providerHint.includes('MPESA') || providerHint.includes('M-PESA')) return 'MPESA';

  // No explicit provider field — infer from the response shape. The universal
  // endpoint's payloads name the provider in their field names/values
  // (e.g. Telebirr responses carry `payerTelebirrNo`).
  const blob = JSON.stringify(data).toUpperCase();
  if (blob.includes('TELEBIRR')) return 'TELEBIRR';
  if (blob.includes('MPESA') || blob.includes('M-PESA')) return 'MPESA';
  if (blob.includes('DASHEN')) return 'DASHEN';
  if (blob.includes('ABYSSINIA')) return 'ABYSSINIA';
  if (blob.includes('CBEBIRR') || blob.includes('CBE BIRR') || blob.includes('CBE_BIRR')) return 'CBE_BIRR';
  if (reference && /^FT/i.test(reference)) return 'CBE';
  return 'CBE'; // Default
}

export function createErrorResult(
  provider: Provider,
  reference: string,
  status: VerificationStatus,
  message: string,
): NormalizedVerificationResult {
  return {
    provider,
    verificationStatus: status,
    transactionStatus: 'UNKNOWN',
    reference,
    referenceMasked: maskRef(reference),
    payerName: null,
    recipientName: null,
    recipientAccount: null,
    recipientAccountMasked: null,
    amount: null,
    currency: 'ETB',
    transactionDate: null,
    receiptNumber: null,
    description: message,
    fees: null,
    rawResponse: { error: message },
  };
}

function maskRef(reference: string): string {
  if (!reference || reference.length <= 8) return reference;
  return `${reference.slice(0, 4)}****${reference.slice(-4)}`;
}

function maskAccount(account: string | null): string | null {
  if (!account) return null;
  const compact = account.replace(/\s/g, '');
  if (compact.length <= 4) return '*'.repeat(compact.length);
  return `${'*'.repeat(Math.max(4, compact.length - 4))}${compact.slice(-4)}`;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
