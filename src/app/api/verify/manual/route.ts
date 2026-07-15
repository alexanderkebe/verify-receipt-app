// POST /api/verify/manual — verify a receipt by reference
import { NextRequest } from 'next/server';
import { performVerification } from '@/lib/verification';
import { manualVerificationSchema, fieldErrors } from '@/lib/validators';
import { requireBusiness, ok, fail, handleError } from '@/lib/api-helpers';
import { extractRequestMeta } from '@/lib/audit';
import { isDemoMode, makeDemoVerificationResult } from '@/lib/demo-data';
import { hasLiveVerifier, performLiveDemoVerification } from '@/lib/demo-verification';
import { parseVerificationInput } from '@/lib/receipt-input';

export const dynamic = 'force-dynamic';
// Telebirr verifications can take 30-45s — allow the function to wait
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (isDemoMode()) {
    const body = await req.json().catch(() => ({}));
    // With an API key configured, demo mode still verifies against the real
    // Verifier API — only persistence and account matching are skipped.
    // Hosted CBE receipt QRs verify live against CBE's own public API even
    // without a Verifier API key.
    const parsed = manualVerificationSchema.safeParse(body);
    if (parsed.success) {
      const target = parseVerificationInput(parsed.data.input);
      if (hasLiveVerifier() || target.cbeToken) {
        const result = await performLiveDemoVerification({
          ...target,
          // URL-derived provider wins; otherwise honour the user's selection
          provider: target.provider ?? parsed.data.provider,
          expectedAmount: parsed.data.expectedAmount,
        });
        return ok(result);
      }
    } else if (hasLiveVerifier()) {
      return fail(Object.values(fieldErrors(parsed.error))[0] ?? 'Invalid input');
    }
    return ok(makeDemoVerificationResult(body.input ?? 'REF0000', 'CBE', body.expectedAmount));
  }
  try {
    const ctx = await requireBusiness();
    const body = await req.json().catch(() => null);
    const parsed = manualVerificationSchema.safeParse(body);
    if (!parsed.success) {
      return fail(Object.values(fieldErrors(parsed.error))[0] ?? 'Invalid input');
    }

    // Auto-detect the provider from the input (reference or receipt URL);
    // unknown providers are resolved by the API's universal endpoint.
    const target = parseVerificationInput(parsed.data.input);

    const meta = extractRequestMeta(req.headers);
    const result = await performVerification(
      {
        // URL-derived provider wins; otherwise honour the user's selection
        provider: target.provider ?? parsed.data.provider,
        reference: target.reference,
        suffix: target.suffix,
        cbeToken: target.cbeToken,
        expectedAmount: parsed.data.expectedAmount,
      },
      {
        businessId: ctx.businessId,
        branchId: ctx.branchId ?? undefined,
        employeeId: ctx.userId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    );

    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
