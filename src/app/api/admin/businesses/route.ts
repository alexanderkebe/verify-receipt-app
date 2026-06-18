// GET /api/admin/businesses — list all businesses (platform admin)
import prisma from '@/lib/prisma';
import { requireRole, ok, handleError } from '@/lib/api-helpers';
import type { SubscriptionTier } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireRole('PLATFORM_ADMIN');
    const businesses = await prisma.business.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        subscription: true,
        _count: { select: { users: true, verifications: true } },
      },
    });

    return ok(
      businesses.map((b) => ({
        id: b.id,
        legalName: b.legalName,
        tradingName: b.tradingName,
        email: b.email,
        status: b.status,
        tier: (b.subscription?.tier ?? 'FREE') as SubscriptionTier,
        usedThisMonth: b.subscription?.verificationsUsedThisMonth ?? 0,
        limit: b.subscription?.monthlyVerificationLimit ?? 50,
        employees: b._count.users,
        verifications: b._count.verifications,
        createdAt: b.createdAt.toISOString(),
      })),
    );
  } catch (error) {
    return handleError(error);
  }
}
