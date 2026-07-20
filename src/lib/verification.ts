// ============================================
// Core Verification Business Logic
// Implements the full verification workflow from SRS Section 7
// ============================================

import { after } from 'next/server';
import { revalidateTag } from 'next/cache';
import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { decrypt, hashReference, maskReference } from '@/lib/crypto';
import { verifyByReference, verifyUniversal, createErrorResult } from '@/lib/verifier-api';
import { resolveCbeReceipt } from '@/lib/cbe-receipt';
import { resolveBoaReceipt } from '@/lib/boa-receipt';
import { resolveDashenReceipt } from '@/lib/dashen-receipt';
import { generateFraudAlerts } from '@/lib/fraud-detection';
import { logAuditEvent, AuditActions } from '@/lib/audit';
import {
  matchRecipientAgainstAccounts,
  type RecipientMatchResult,
} from '@/lib/recipient-matching';
import type {
  Provider,
  ResultLevel,
  VerificationResult,
  VerificationInput,
  NormalizedVerificationResult,
  DuplicateInfo,
} from '@/types';

interface VerificationContext {
  businessId: string;
  branchId?: string;
  employeeId: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Main verification orchestrator
 * Implements the full workflow: validate → duplicate check → API call → match → classify → alert → store
 */
export async function performVerification(
  input: VerificationInput,
  context: VerificationContext,
): Promise<VerificationResult> {
  const startTime = Date.now();

  // 1. Check subscription limits; hosted-receipt tokens resolve concurrently
  //    (they hit the banks' public receipt endpoints, not the metered
  //    Verifier API — that call is still gated behind the limit check).
  const [, resolved] = await Promise.all([
    checkSubscriptionLimit(context.businessId),
    resolveHostedReceipt(input),
  ]);
  const reference =
    resolved?.verificationStatus === 'VERIFIED' ? resolved.reference : input.reference;

  // 2+3. Neither the duplicate check nor the recipient-account prefetch
  //      gates the external Verifier API call — run all three concurrently
  //      so the DB round trips hide behind the (much slower) external lookup.
  const refHash = hashReference(reference);
  const knownProvider = resolved?.provider ?? input.provider ?? null;
  const [duplicateInfo, apiResult, prefetchedAccounts] = await Promise.all([
    checkDuplicate(context.businessId, refHash),
    callVerifierApi(input, resolved, context.businessId),
    knownProvider
      ? fetchMatchAccounts(context.businessId, context.branchId, knownProvider)
      : Promise.resolve(null),
  ]);
  const provider = apiResult.provider;

  // 5. Match recipient against registered business accounts. The prefetched
  //    list only applies when the API confirmed the provider we prefetched
  //    for (the universal endpoint may detect a different one).
  let matchAccounts = knownProvider === provider ? prefetchedAccounts : null;
  if (matchAccounts === null && apiResult.verificationStatus === 'VERIFIED') {
    matchAccounts = await fetchMatchAccounts(context.businessId, context.branchId, provider);
  }
  const recipientMatch = matchRecipient(provider, matchAccounts ?? [], apiResult);

  // 6. Compare amounts
  const amountMatch = compareAmounts(input.expectedAmount, apiResult.amount);

  // 7. Classify the result (GREEN / RED / YELLOW)
  const { resultLevel, resultReason } = classifyResult(
    apiResult,
    recipientMatch,
    amountMatch,
    duplicateInfo !== null,
  );

  const processingTime = Date.now() - startTime;

  // 8. Store the verification record
  const verification = await prisma.receiptVerification.create({
    data: {
      businessId: context.businessId,
      branchId: context.branchId,
      employeeId: context.employeeId,
      matchedAccountId: recipientMatch.accountId,
      provider,
      referenceHash: refHash,
      referenceMasked: maskReference(reference),
      expectedAmount: input.expectedAmount,
      verifiedAmount: apiResult.amount,
      currency: apiResult.currency,
      payerName: apiResult.payerName,
      recipientName: apiResult.recipientName,
      recipientAccountMasked: apiResult.recipientAccountMasked,
      recipientMatches: recipientMatch.matches,
      amountMatches: amountMatch.matches,
      isDuplicate: duplicateInfo !== null,
      duplicateOfId: duplicateInfo?.previousVerificationId,
      verificationStatus: apiResult.verificationStatus,
      transactionStatus: apiResult.transactionStatus,
      resultLevel,
      apiResponseStatus: apiResult.verificationStatus,
      apiResponseDurationMs: processingTime,
      rawApiResponse: apiResult.rawResponse as unknown as Prisma.InputJsonValue,
      extractedFields: apiResult as unknown as Prisma.InputJsonValue,
      transactionDate: apiResult.transactionDate ? new Date(apiResult.transactionDate) : null,
    },
  });

  // 9–11. Usage increment, fraud alerts, and audit log are independent and
  // not read by the response — run them after it is sent. after() maps to
  // waitUntil on Vercel, so the function stays alive until they finish.
  after(async () => {
    try {
      await Promise.all([
        incrementVerificationCount(context.businessId),
        generateFraudAlerts(
          verification.id,
          context.businessId,
          {
            resultLevel,
            recipientMatches: recipientMatch.matches,
            amountMatches: amountMatch.matches,
            isDuplicate: duplicateInfo !== null,
            verificationStatus: apiResult.verificationStatus,
            transactionStatus: apiResult.transactionStatus,
          },
          context.employeeId,
        ),
        logAuditEvent({
          businessId: context.businessId,
          userId: context.employeeId,
          action: AuditActions.VERIFICATION_COMPLETED,
          entityType: 'ReceiptVerification',
          entityId: verification.id,
          newValues: {
            provider,
            resultLevel,
            resultReason,
            isDuplicate: duplicateInfo !== null,
            recipientMatches: recipientMatch.matches,
            amountMatches: amountMatch.matches,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        }),
      ]);
    } catch (error) {
      console.error('Post-verification bookkeeping failed:', error);
    }
    // Bust the cached dashboard stats so the new verification (and any
    // fraud alerts) show up immediately instead of after the 60s TTL.
    revalidateTag(`dashboard:${context.businessId}`, 'max');
  });

  return {
    id: verification.id,
    provider,
    verificationStatus: apiResult.verificationStatus,
    transactionStatus: apiResult.transactionStatus,
    resultLevel,
    resultReason,
    referenceMasked: maskReference(reference),
    payerName: apiResult.payerName,
    recipientName: apiResult.recipientName,
    recipientAccountMasked: apiResult.recipientAccountMasked,
    recipientMatches: recipientMatch.matches,
    amountMatches: amountMatch.matches,
    expectedAmount: input.expectedAmount ?? null,
    verifiedAmount: apiResult.amount,
    currency: apiResult.currency,
    isDuplicate: duplicateInfo !== null,
    duplicateInfo,
    transactionDate: apiResult.transactionDate,
    receiptNumber: apiResult.receiptNumber,
    fees: apiResult.fees,
    apiDescription: apiResult.description,
    processingTimeMs: processingTime,
    createdAt: verification.createdAt.toISOString(),
  };
}

/**
 * Record employee decision on a verification
 */
export async function recordDecision(
  verificationId: string,
  decision: 'ACCEPTED' | 'REJECTED' | 'ESCALATED',
  reason: string | undefined,
  userId: string,
  businessId: string,
): Promise<void> {
  const verification = await prisma.receiptVerification.findFirst({
    where: { id: verificationId, businessId },
    select: { id: true, employeeDecision: true },
  });

  if (!verification) {
    throw new Error('Verification not found');
  }

  if (verification.employeeDecision) {
    throw new Error('Decision already recorded for this verification');
  }

  await prisma.receiptVerification.update({
    where: { id: verificationId },
    data: {
      employeeDecision: decision,
      decisionReason: reason,
    },
  });

  await logAuditEvent({
    businessId,
    userId,
    action: AuditActions.VERIFICATION_DECISION,
    entityType: 'ReceiptVerification',
    entityId: verificationId,
    newValues: { decision, reason },
  });
}

/**
 * Supervisor override (requires re-auth — handled at API route level)
 */
export async function recordOverride(
  verificationId: string,
  finalDecision: 'ACCEPTED' | 'REJECTED',
  reason: string,
  supervisorId: string,
  businessId: string,
): Promise<void> {
  const verification = await prisma.receiptVerification.findFirst({
    where: { id: verificationId, businessId },
    select: { id: true, employeeDecision: true, resultLevel: true },
  });

  if (!verification) {
    throw new Error('Verification not found');
  }

  if (!reason || reason.trim().length < 5) {
    throw new Error('Override reason is required (minimum 5 characters)');
  }

  await prisma.receiptVerification.update({
    where: { id: verificationId },
    data: {
      employeeDecision: finalDecision,
      overrideByUserId: supervisorId,
      overrideReason: reason,
      overrideAt: new Date(),
    },
  });

  await logAuditEvent({
    businessId,
    userId: supervisorId,
    action: AuditActions.VERIFICATION_OVERRIDE,
    entityType: 'ReceiptVerification',
    entityId: verificationId,
    oldValues: {
      previousDecision: verification.employeeDecision,
      previousResultLevel: verification.resultLevel,
    },
    newValues: {
      finalDecision,
      overrideReason: reason,
    },
  });
}

// ============================================
// Internal Helper Functions
// ============================================

/**
 * CBE receipt lookups require the 8-digit account suffix of either party.
 * When a cashier types just the FT reference, try the suffixes of the
 * business's own registered CBE accounts — payments to the business can
 * always be retrieved with the receiving account's suffix.
 */
async function verifyCbeWithRegisteredSuffix(
  businessId: string,
  reference: string,
): Promise<NormalizedVerificationResult> {
  const accounts = await prisma.paymentAccount.findMany({
    where: { businessId, provider: 'CBE', status: 'ACTIVE', NOT: { suffix: null } },
    select: { suffix: true },
    take: 3,
  });
  const suffixes = [...new Set(accounts.map((a) => a.suffix).filter((s): s is string => !!s))];

  if (suffixes.length === 0) {
    return createErrorResult(
      'CBE',
      reference,
      'ERROR',
      'CBE receipts need the receipt link or QR code. Scan the QR on the receipt or paste the full receipt link — or register your CBE account under Payment Accounts so lookups can use it automatically.',
    );
  }

  // Each suffix is a full external lookup — run them concurrently (the
  // helper never rejects; it returns error results) and take the first
  // VERIFIED hit, else surface the last attempt's result.
  const results = await Promise.all(
    suffixes.map((suffix) => verifyByReference('CBE', reference, suffix)),
  );
  return (
    results.find((r) => r.verificationStatus === 'VERIFIED') ?? results[results.length - 1]
  );
}

/**
 * Hosted-receipt QRs (CBE mbreciept / BoA slip) carry an opaque token
 * instead of the FT reference — resolve it against the bank's public
 * receipt API so the real reference drives duplicate detection and
 * storage. Dashen resolves from the printed/typed transaction reference
 * against its public receipt page — the in-app QR token is not verifiable.
 */
async function resolveHostedReceipt(
  input: VerificationInput,
): Promise<NormalizedVerificationResult | null> {
  if (input.receiptToken && input.provider !== 'DASHEN') {
    return input.provider === 'ABYSSINIA'
      ? resolveBoaReceipt(input.receiptToken)
      : resolveCbeReceipt(input.receiptToken);
  }
  if (input.provider === 'DASHEN') {
    return resolveDashenReceipt(input.reference);
  }
  return null;
}

/**
 * Call the external Verifier API — when the provider is known, use its
 * dedicated endpoint; otherwise let the universal endpoint auto-detect.
 * CBE references typed without a suffix fall back to the business's own
 * registered CBE account suffixes (the receiver can query with theirs).
 * Receipts already resolved against a bank's own API skip the call.
 */
async function callVerifierApi(
  input: VerificationInput,
  resolved: NormalizedVerificationResult | null,
  businessId: string,
): Promise<NormalizedVerificationResult> {
  if (resolved) return resolved;
  if (input.provider === 'CBE' && !input.suffix) {
    return verifyCbeWithRegisteredSuffix(businessId, input.reference);
  }
  if (input.provider) {
    return verifyByReference(input.provider, input.reference, input.suffix, input.phoneNumber);
  }
  return verifyUniversal(input.reference, input.suffix, input.phoneNumber);
}

async function checkSubscriptionLimit(businessId: string): Promise<void> {
  const subscription = await prisma.subscription.findUnique({
    where: { businessId },
  });

  if (!subscription) return; // No subscription = allow (grace)

  if (subscription.monthlyVerificationLimit === -1) return; // Unlimited

  if (subscription.verificationsUsedThisMonth >= subscription.monthlyVerificationLimit) {
    throw new Error('Monthly verification limit reached. Please upgrade your plan.');
  }
}

async function incrementVerificationCount(businessId: string): Promise<void> {
  try {
    await prisma.subscription.update({
      where: { businessId },
      data: {
        verificationsUsedThisMonth: { increment: 1 },
      },
    });
  } catch {
    // Subscription might not exist yet — ignore
  }
}

async function checkDuplicate(
  businessId: string,
  referenceHash: string,
): Promise<DuplicateInfo | null> {
  const existing = await prisma.receiptVerification.findFirst({
    where: {
      businessId,
      referenceHash,
      employeeDecision: 'ACCEPTED',
    },
    select: {
      id: true,
      createdAt: true,
      resultLevel: true,
      employeeDecision: true,
      verifiedAmount: true,
      employee: { select: { fullName: true } },
      branch: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!existing) return null;

  return {
    previousVerificationId: existing.id,
    previousDate: existing.createdAt.toISOString(),
    previousBranch: existing.branch?.name ?? null,
    previousEmployee: existing.employee.fullName,
    previousResult: existing.resultLevel as ResultLevel,
    previousDecision: existing.employeeDecision as 'ACCEPTED' | 'REJECTED' | 'ESCALATED' | null,
    previousAmount: existing.verifiedAmount ? Number(existing.verifiedAmount) : null,
  };
}

/** Active accounts for a provider, scoped to business/branch */
async function fetchMatchAccounts(
  businessId: string,
  branchId: string | undefined,
  provider: Provider,
) {
  return prisma.paymentAccount.findMany({
    where: {
      businessId,
      provider,
      status: 'ACTIVE',
      OR: branchId
        ? [{ branchId: null }, { branchId }]
        : [{ branchId: null }],
    },
    select: {
      id: true,
      accountNumberMasked: true,
      accountHolderName: true,
      phoneNumber: true,
      // Needed for the legacy-Telebirr decrypt fallback in matchRecipient
      accountNumberEncrypted: true,
    },
  });
}

type MatchAccount = Awaited<ReturnType<typeof fetchMatchAccounts>>[number];

function matchRecipient(
  provider: Provider,
  accounts: MatchAccount[],
  apiResult: NormalizedVerificationResult,
): RecipientMatchResult {
  if (apiResult.verificationStatus !== 'VERIFIED') {
    return { matches: null, accountId: null };
  }

  const matchableAccounts = accounts.map((account) => {
    let phoneNumber = account.phoneNumber;
    // Accounts created before Telebirr phone normalization may only have the
    // full number in the encrypted account-number field. Read it in memory for
    // matching without exposing or persisting the plaintext.
    if (provider === 'TELEBIRR' && !phoneNumber) {
      try {
        phoneNumber = decrypt(account.accountNumberEncrypted);
      } catch {
        phoneNumber = null;
      }
    }

    return {
      id: account.id,
      accountNumberMasked: account.accountNumberMasked,
      accountHolderName: account.accountHolderName,
      phoneNumber,
    };
  });

  return matchRecipientAgainstAccounts(
    provider,
    apiResult.recipientAccount,
    apiResult.recipientName,
    matchableAccounts,
  );
}

interface AmountMatchResult {
  matches: boolean | null;
  difference: number | null;
}

function compareAmounts(
  expected: number | undefined,
  verified: number | null,
): AmountMatchResult {
  if (expected === undefined || expected === null || verified === null) {
    return { matches: null, difference: null };
  }

  const diff = verified - expected;
  // Allow a tiny tolerance for floating point
  const matches = Math.abs(diff) < 0.01;

  return { matches, difference: diff };
}

interface ClassificationResult {
  resultLevel: ResultLevel;
  resultReason: string;
}

function classifyResult(
  apiResult: NormalizedVerificationResult,
  recipientMatch: RecipientMatchResult,
  amountMatch: AmountMatchResult,
  isDuplicate: boolean,
): ClassificationResult {
  // YELLOW — Unable to verify (API error, timeout, unsupported)
  if (['ERROR', 'TIMEOUT', 'UNSUPPORTED'].includes(apiResult.verificationStatus)) {
    return {
      resultLevel: 'YELLOW',
      resultReason: apiResult.description || 'Unable to verify at this time. Please try again later.',
    };
  }

  // YELLOW — Reference not found. Prefer the resolver's own message when it
  // gives a provider-specific hint (e.g. Dashen "upload the shared PDF").
  if (apiResult.verificationStatus === 'NOT_FOUND') {
    return {
      resultLevel: 'YELLOW',
      resultReason:
        apiResult.description && apiResult.provider === 'DASHEN'
          ? apiResult.description
          : 'Transaction reference not found. The reference may be incorrect or the provider system may be delayed.',
    };
  }

  // RED — Transaction not successful
  if (apiResult.transactionStatus && !['SUCCESS', 'UNKNOWN'].includes(apiResult.transactionStatus)) {
    return {
      resultLevel: 'RED',
      resultReason: `Payment was ${apiResult.transactionStatus.toLowerCase()}. This transaction did not complete successfully.`,
    };
  }

  // RED — Duplicate receipt
  if (isDuplicate) {
    return {
      resultLevel: 'RED',
      resultReason: 'This receipt has already been accepted by your business. This may be a duplicate submission.',
    };
  }

  // RED — Recipient mismatch
  if (recipientMatch.matches === false) {
    return {
      resultLevel: 'RED',
      resultReason: 'The payment recipient does not match any of your registered accounts. This payment was not made to your business.',
    };
  }

  // RED — Amount mismatch
  if (amountMatch.matches === false && amountMatch.difference !== null) {
    const direction = amountMatch.difference > 0 ? 'overpayment' : 'underpayment';
    const diff = Math.abs(amountMatch.difference).toFixed(2);
    return {
      resultLevel: 'RED',
      resultReason: `Amount mismatch detected: ${direction} of ${diff} ETB. Expected amount does not match the verified transaction amount.`,
    };
  }

  // GREEN — All checks passed
  if (apiResult.verificationStatus === 'VERIFIED' &&
      recipientMatch.matches === true &&
      (amountMatch.matches === true || amountMatch.matches === null)) {
    return {
      resultLevel: 'GREEN',
      resultReason:
        amountMatch.matches === null
          ? 'Payment verified and the recipient matches your business. Confirm the amount and transaction time shown below match what the customer paid.'
          : 'Payment verified successfully. Recipient matches, amount is correct, and this receipt has not been previously accepted.',
    };
  }

  // YELLOW — Fallback / manual review
  return {
    resultLevel: 'YELLOW',
    resultReason: 'This receipt requires manual review. Some verification details could not be confirmed automatically.',
  };
}
