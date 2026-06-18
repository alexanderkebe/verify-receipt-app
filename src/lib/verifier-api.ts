// ============================================
// Verifier API Integration Layer
// Handles all communication with Vixen878/verifier-api
// ============================================

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
        recordFailure(provider);
        if (attempt === VERIFICATION_CONFIG.maxRetries) {
          return createErrorResult(provider, reference, 'TIMEOUT', 'Verification timed out. The payment provider may be temporarily unavailable.');
        }
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
      const provider = detectProvider(data);
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

// ---- Image Verification ----
export async function verifyByImage(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<NormalizedVerificationResult> {
  try {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(imageBuffer)], { type: mimeType });
    formData.append('image', blob, `receipt.${mimeType.split('/')[1]}`);

    const response = await fetch(`${VERIFIER_API_BASE_URL}/verify-image`, {
      method: 'POST',
      headers: {
        'x-api-key': VERIFIER_API_KEY,
      },
      body: formData,
      signal: AbortSignal.timeout(VERIFICATION_CONFIG.apiTimeoutMs * 2), // Image takes longer
    });

    if (response.ok) {
      const data = await response.json();
      const provider = detectProvider(data);
      return normalizeResponse(provider, 'IMAGE', data);
    }

    return createErrorResult('CBE', 'IMAGE', 'ERROR', 'Image verification failed');
  } catch {
    return createErrorResult('CBE', 'IMAGE', 'TIMEOUT', 'Image verification timed out');
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
      if (suffix) body.suffix = suffix;
      break;
    case 'ABYSSINIA':
      if (suffix) body.suffix = suffix;
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
function normalizeResponse(
  provider: Provider,
  reference: string,
  data: any,
): NormalizedVerificationResult {
  // The Verifier API returns different formats per provider
  // This normalizes them into a consistent internal model

  const isSuccess = determineSuccess(data);
  const txStatus = determineTransactionStatus(data);

  return {
    provider,
    verificationStatus: isSuccess ? 'VERIFIED' : 'INVALID',
    transactionStatus: txStatus,
    reference,
    referenceMasked: maskRef(reference),
    payerName: extractField(data, ['payerName', 'payer_name', 'senderName', 'sender_name', 'from', 'payer']),
    recipientName: extractField(data, ['receiverName', 'receiver_name', 'recipientName', 'recipient_name', 'creditedPartyName', 'to', 'receiver']),
    recipientAccount: extractField(data, ['receiverAccount', 'receiver_account', 'recipientAccount', 'recipient_account', 'creditedAccount']),
    recipientAccountMasked: null, // Will be masked after extraction
    amount: extractNumber(data, ['amount', 'settledAmount', 'settled_amount', 'transactionAmount', 'transaction_amount', 'totalAmount']),
    currency: 'ETB',
    transactionDate: extractField(data, ['date', 'transactionDate', 'transaction_date', 'paymentDate', 'payment_date', 'createdAt']),
    receiptNumber: extractField(data, ['receiptNumber', 'receipt_number', 'transactionRef', 'transaction_ref', 'referenceNumber']),
    description: extractField(data, ['description', 'reason', 'narrative', 'paymentReason', 'payment_reason']),
    fees: extractNumber(data, ['fee', 'fees', 'serviceCharge', 'service_charge', 'totalFees']),
    rawResponse: data,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
function determineSuccess(data: any): boolean {
  // Check various success indicators
  if (data.status === 'success' || data.status === 'SUCCESS' || data.status === true) return true;
  if (data.success === true) return true;
  if (data.verified === true) return true;
  if (data.transactionStatus === 'SUCCESS' || data.transactionStatus === 'COMPLETED') return true;
  if (data.data && (data.data.status === 'success' || data.data.success === true)) return true;
  return false;
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

function detectProvider(data: Record<string, unknown>): Provider {
  const providerHint = String(data.provider || data.bank || data.service || '').toUpperCase();
  if (providerHint.includes('CBE') && !providerHint.includes('BIRR')) return 'CBE';
  if (providerHint.includes('TELEBIRR')) return 'TELEBIRR';
  if (providerHint.includes('DASHEN')) return 'DASHEN';
  if (providerHint.includes('ABYSSINIA')) return 'ABYSSINIA';
  if (providerHint.includes('CBE BIRR') || providerHint.includes('CBEBIRR')) return 'CBE_BIRR';
  if (providerHint.includes('MPESA') || providerHint.includes('M-PESA')) return 'MPESA';
  return 'CBE'; // Default
}

function createErrorResult(
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

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
