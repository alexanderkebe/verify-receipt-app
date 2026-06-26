// PATCH /api/admin/businesses/[id] — suspend/activate or change plan
import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireRole, ok, fail, handleError } from '@/lib/api-helpers';
import { isDemoMode } from '@/lib/demo-data';
import { logAuditEvent, AuditActions, extractRequestMeta } from '@/lib/audit';
import { fieldErrors } from '@/lib/validators';
import { SUBSCRIPTION_CONFIG } from '@/lib/constants';
import type { SubscriptionTier } from '@/types';

export const dynamic = 'force-dynamic';

const schema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']).optional(),
  tier: z.enum(['FREE', 'BASIC', 'PRO']).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (isDemoMode()) {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    return ok({ id, status: body.status, tier: body.tier });
  }
  try {
    const ctx = await requireRole('PLATFORM_ADMIN');
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return fail(Object.values(fieldErrors(parsed.error))[0] ?? 'Invalid input');
    }

    const business = await prisma.business.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!business) return fail('Business not found', 404);

    if (parsed.data.status) {
      await prisma.business.update({ where: { id }, data: { status: parsed.data.status } });
      await logAuditEvent({
        businessId: id,
        userId: ctx.userId,
        action: parsed.data.status === 'SUSPENDED' ? AuditActions.ADMIN_BUSINESS_SUSPENDED : AuditActions.BUSINESS_ACTIVATED,
        entityType: 'Business',
        entityId: id,
        oldValues: { status: business.status },
        newValues: { status: parsed.data.status },
        ...extractRequestMeta(req.headers),
      });
    }

    if (parsed.data.tier) {
      const tier = parsed.data.tier as SubscriptionTier;
      const limit = SUBSCRIPTION_CONFIG[tier].limit;
      await prisma.subscription.upsert({
        where: { businessId: id },
        update: { tier, monthlyVerificationLimit: limit },
        create: {
          businessId: id,
          tier,
          monthlyVerificationLimit: limit,
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      await logAuditEvent({
        businessId: id,
        userId: ctx.userId,
        action: AuditActions.ADMIN_PLAN_CHANGED,
        entityType: 'Subscription',
        entityId: id,
        newValues: { tier },
        ...extractRequestMeta(req.headers),
      });
    }

    return ok({ id, status: parsed.data.status, tier: parsed.data.tier });
  } catch (error) {
    return handleError(error);
  }
}
