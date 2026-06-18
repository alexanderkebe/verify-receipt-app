// GET /api/admin/audit — platform-wide audit log
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole, ok, handleError } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireRole('PLATFORM_ADMIN');
    const limit = Math.min(200, Number(req.nextUrl.searchParams.get('limit') ?? '100') || 100);

    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { fullName: true, email: true } },
        business: { select: { legalName: true } },
      },
    });

    return ok(
      logs.map((l) => ({
        id: l.id,
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        user: l.user?.fullName ?? l.user?.email ?? 'System',
        business: l.business?.legalName ?? '—',
        ipAddress: l.ipAddress,
        createdAt: l.createdAt.toISOString(),
      })),
    );
  } catch (error) {
    return handleError(error);
  }
}
