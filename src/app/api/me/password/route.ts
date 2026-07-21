// POST /api/me/password — change the signed-in user's password.
// Employees start on a temp password their boss handed them; the mobile app
// forces this change on first login (signalled by mustChangePassword on /api/me).
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { changePasswordSchema, fieldErrors } from '@/lib/validators';
import { requireSession, ok, fail, handleError } from '@/lib/api-helpers';
import { logAuditEvent, AuditActions, extractRequestMeta } from '@/lib/audit';
import { isDemoMode } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (isDemoMode()) return fail('Password changes are disabled in demo mode');
  try {
    const ctx = await requireSession();
    const body = await req.json().catch(() => null);
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return fail(Object.values(fieldErrors(parsed.error))[0] ?? 'Invalid input');
    }
    const { currentPassword, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { passwordHash: true },
    });
    if (!user) return fail('Account not found', 404);

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return fail('Current password is incorrect', 403);

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: ctx.userId },
      data: {
        passwordHash,
        // Clearing the invitation token marks the account as activated —
        // the app stops forcing a password change.
        invitationToken: null,
      },
    });

    await logAuditEvent({
      businessId: ctx.businessId ?? undefined,
      userId: ctx.userId,
      action: AuditActions.PASSWORD_CHANGED,
      entityType: 'User',
      entityId: ctx.userId,
      ...extractRequestMeta(req.headers),
    });

    return ok({ changed: true });
  } catch (error) {
    return handleError(error);
  }
}
