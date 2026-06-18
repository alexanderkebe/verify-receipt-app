// POST /api/verify/[id]/decision — employee accept/reject/escalate
import { NextRequest } from 'next/server';
import { recordDecision } from '@/lib/verification';
import { decisionSchema, fieldErrors } from '@/lib/validators';
import { requireBusiness, ok, fail, handleError } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireBusiness();
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = decisionSchema.safeParse(body);
    if (!parsed.success) {
      return fail(Object.values(fieldErrors(parsed.error))[0] ?? 'Invalid input');
    }

    await recordDecision(id, parsed.data.decision, parsed.data.reason, ctx.userId, ctx.businessId);
    return ok({ id, decision: parsed.data.decision });
  } catch (error) {
    return handleError(error);
  }
}
