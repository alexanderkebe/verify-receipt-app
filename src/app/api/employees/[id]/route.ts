// PATCH /api/employees/[id] — update status (suspend/activate) or role
import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireRole, ok, fail, handleError } from '@/lib/api-helpers';
import { logAuditEvent, AuditActions, extractRequestMeta } from '@/lib/audit';
import { fieldErrors } from '@/lib/validators';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']).optional(),
  role: z.enum(['MANAGER', 'EMPLOYEE']).optional(),
  jobTitle: z.string().trim().optional(),
  branchId: z.string().uuid().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRole('OWNER', 'MANAGER');
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return fail(Object.values(fieldErrors(parsed.error))[0] ?? 'Invalid input');
    }

    const target = await prisma.user.findFirst({
      where: { id, businessId: ctx.businessId! },
      select: { id: true, role: true, status: true },
    });
    if (!target) return fail('Employee not found', 404);
    if (target.role === 'OWNER') return fail('The business owner cannot be modified here', 403);
    if (target.id === ctx.userId) return fail('You cannot modify your own account here', 403);

    const updated = await prisma.user.update({
      where: { id },
      data: {
        status: parsed.data.status,
        role: parsed.data.role,
        jobTitle: parsed.data.jobTitle,
        branchId: parsed.data.branchId,
      },
      select: { id: true, fullName: true, role: true, status: true },
    });

    const action =
      parsed.data.status === 'SUSPENDED'
        ? AuditActions.EMPLOYEE_SUSPENDED
        : parsed.data.status === 'ACTIVE'
          ? AuditActions.EMPLOYEE_ACTIVATED
          : parsed.data.role
            ? AuditActions.EMPLOYEE_ROLE_CHANGED
            : AuditActions.EMPLOYEE_UPDATED;

    await logAuditEvent({
      businessId: ctx.businessId!,
      userId: ctx.userId,
      action,
      entityType: 'User',
      entityId: id,
      oldValues: { status: target.status, role: target.role },
      newValues: { status: updated.status, role: updated.role },
      ...extractRequestMeta(req.headers),
    });

    return ok(updated);
  } catch (error) {
    return handleError(error);
  }
}
