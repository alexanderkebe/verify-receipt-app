// GET /api/me — the signed-in user's profile (mobile app bootstrap)
import prisma from '@/lib/prisma';
import { requireSession, ok, handleError } from '@/lib/api-helpers';
import { isDemoMode } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (isDemoMode()) {
    return ok({
      id: 'demo-user-owner',
      fullName: 'Abebe Girma',
      email: 'demo@addiscoffee.et',
      role: 'OWNER',
      businessName: 'Addis Coffee House',
      mustChangePassword: false,
    });
  }
  try {
    const ctx = await requireSession();
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { invitationToken: true },
    });
    return ok({
      id: ctx.userId,
      fullName: ctx.fullName,
      email: ctx.email,
      role: ctx.role,
      businessName: ctx.businessName,
      // Boss-created accounts keep their invitation token until the employee
      // sets their own password — the app forces the change while it's set.
      mustChangePassword: Boolean(user?.invitationToken),
    });
  } catch (error) {
    return handleError(error);
  }
}
