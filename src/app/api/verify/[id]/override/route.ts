// POST /api/verify/[id]/override — supervisor override (requires re-auth)
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { recordOverride } from '@/lib/verification';
import { overrideSchema, fieldErrors } from '@/lib/validators';
import { requireRole, ok, fail, handleError } from '@/lib/api-helpers';
import { isDemoMode } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (isDemoMode()) {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    return ok({ id, finalDecision: body.finalDecision ?? 'ACCEPTED' });
  }
  try {
    const ctx = await requireRole('OWNER', 'MANAGER');
    if (!ctx.businessId) return fail('No business associated with this account', 403);
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = overrideSchema.safeParse(body);
    if (!parsed.success) {
      return fail(Object.values(fieldErrors(parsed.error))[0] ?? 'Invalid input');
    }

    // Re-authenticate the supervisor
    const supervisor = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { passwordHash: true },
    });
    if (!supervisor || !(await bcrypt.compare(parsed.data.password, supervisor.passwordHash))) {
      return fail('Re-authentication failed. Incorrect password.', 401);
    }

    await recordOverride(id, parsed.data.finalDecision, parsed.data.reason, ctx.userId, ctx.businessId);
    return ok({ id, finalDecision: parsed.data.finalDecision });
  } catch (error) {
    return handleError(error);
  }
}
