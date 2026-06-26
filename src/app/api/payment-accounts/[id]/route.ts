// PATCH /api/payment-accounts/[id] — toggle status / edit metadata
import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireRole, ok, fail, handleError } from '@/lib/api-helpers';
import { isDemoMode } from '@/lib/demo-data';
import { logAuditEvent, AuditActions, extractRequestMeta } from '@/lib/audit';
import { fieldErrors } from '@/lib/validators';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']).optional(),
  nickname: z.string().trim().optional(),
  accountHolderName: z.string().trim().min(2).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (isDemoMode()) {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    return ok({ id, status: body.status ?? 'ACTIVE', nickname: body.nickname, accountHolderName: body.accountHolderName });
  }
  try {
    const ctx = await requireRole('OWNER', 'MANAGER');
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return fail(Object.values(fieldErrors(parsed.error))[0] ?? 'Invalid input');
    }

    const account = await prisma.paymentAccount.findFirst({
      where: { id, businessId: ctx.businessId! },
      select: { id: true, status: true },
    });
    if (!account) return fail('Payment account not found', 404);

    const updated = await prisma.paymentAccount.update({
      where: { id },
      data: parsed.data,
      select: { id: true, status: true, nickname: true, accountHolderName: true },
    });

    await logAuditEvent({
      businessId: ctx.businessId!,
      userId: ctx.userId,
      action:
        parsed.data.status === 'DEACTIVATED' || parsed.data.status === 'SUSPENDED'
          ? AuditActions.PAYMENT_ACCOUNT_DEACTIVATED
          : AuditActions.PAYMENT_ACCOUNT_UPDATED,
      entityType: 'PaymentAccount',
      entityId: id,
      oldValues: { status: account.status },
      newValues: { status: updated.status },
      ...extractRequestMeta(req.headers),
    });

    return ok(updated);
  } catch (error) {
    return handleError(error);
  }
}
