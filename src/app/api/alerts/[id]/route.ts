// PATCH /api/alerts/[id] — resolve / dismiss / assign
import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireRole, ok, fail, handleError } from '@/lib/api-helpers';
import { logAuditEvent, AuditActions, extractRequestMeta } from '@/lib/audit';
import { fieldErrors } from '@/lib/validators';

export const dynamic = 'force-dynamic';

const schema = z.object({
  status: z.enum(['OPEN', 'ASSIGNED', 'RESOLVED', 'DISMISSED']),
  resolution: z.string().trim().max(500).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRole('OWNER', 'MANAGER');
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return fail(Object.values(fieldErrors(parsed.error))[0] ?? 'Invalid input');
    }

    const alert = await prisma.fraudAlert.findFirst({
      where: { id, businessId: ctx.businessId! },
      select: { id: true, status: true },
    });
    if (!alert) return fail('Alert not found', 404);

    const resolved = parsed.data.status === 'RESOLVED' || parsed.data.status === 'DISMISSED';
    const updated = await prisma.fraudAlert.update({
      where: { id },
      data: {
        status: parsed.data.status,
        resolution: parsed.data.resolution,
        reviewedById: ctx.userId,
        resolvedAt: resolved ? new Date() : null,
      },
      select: { id: true, status: true },
    });

    await logAuditEvent({
      businessId: ctx.businessId!,
      userId: ctx.userId,
      action: resolved ? AuditActions.ALERT_RESOLVED : AuditActions.ALERT_ASSIGNED,
      entityType: 'FraudAlert',
      entityId: id,
      newValues: { status: updated.status, resolution: parsed.data.resolution },
      ...extractRequestMeta(req.headers),
    });

    return ok(updated);
  } catch (error) {
    return handleError(error);
  }
}
