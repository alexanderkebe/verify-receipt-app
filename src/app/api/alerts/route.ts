// GET /api/alerts — list fraud alerts
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { requireRole, ok, handleError } from '@/lib/api-helpers';
import type { AlertSeverity, AlertStatus, AlertType } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireRole('OWNER', 'MANAGER');
    const sp = req.nextUrl.searchParams;
    const where: Prisma.FraudAlertWhereInput = { businessId: ctx.businessId! };
    const status = sp.get('status') as AlertStatus | null;
    const severity = sp.get('severity') as AlertSeverity | null;
    if (status) where.status = status;
    if (severity) where.severity = severity;

    const alerts = await prisma.fraudAlert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        verification: {
          select: { referenceMasked: true, provider: true, payerName: true, verifiedAmount: true },
        },
      },
    });

    return ok(
      alerts.map((a) => ({
        id: a.id,
        severity: a.severity as AlertSeverity,
        alertType: a.alertType as AlertType,
        status: a.status as AlertStatus,
        description: a.description,
        resolution: a.resolution,
        createdAt: a.createdAt.toISOString(),
        reference: a.verification.referenceMasked,
        provider: a.verification.provider,
        payerName: a.verification.payerName,
        amount: a.verification.verifiedAmount ? Number(a.verification.verifiedAmount) : null,
      })),
    );
  } catch (error) {
    return handleError(error);
  }
}
