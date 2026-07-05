// POST /api/verify/manual — verify a receipt by reference
import { NextRequest } from 'next/server';
import { performVerification } from '@/lib/verification';
import { manualVerificationSchema, fieldErrors } from '@/lib/validators';
import { requireBusiness, ok, fail, handleError } from '@/lib/api-helpers';
import { extractRequestMeta } from '@/lib/audit';
import { isDemoMode, makeDemoVerificationResult } from '@/lib/demo-data';
import { hasLiveVerifier, performLiveDemoVerification } from '@/lib/demo-verification';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (isDemoMode()) {
    const body = await req.json().catch(() => ({}));
    // With an API key configured, demo mode still verifies against the real
    // Verifier API — only persistence and account matching are skipped.
    if (hasLiveVerifier()) {
      const parsed = manualVerificationSchema.safeParse(body);
      if (!parsed.success) {
        return fail(Object.values(fieldErrors(parsed.error))[0] ?? 'Invalid input');
      }
      const result = await performLiveDemoVerification(parsed.data);
      return ok(result);
    }
    return ok(makeDemoVerificationResult(body.reference ?? 'REF0000', body.provider ?? 'CBE', body.expectedAmount));
  }
  try {
    const ctx = await requireBusiness();
    const body = await req.json().catch(() => null);
    const parsed = manualVerificationSchema.safeParse(body);
    if (!parsed.success) {
      return fail(Object.values(fieldErrors(parsed.error))[0] ?? 'Invalid input');
    }

    const meta = extractRequestMeta(req.headers);
    const result = await performVerification(
      {
        provider: parsed.data.provider,
        reference: parsed.data.reference,
        suffix: parsed.data.suffix,
        phoneNumber: parsed.data.phoneNumber,
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
