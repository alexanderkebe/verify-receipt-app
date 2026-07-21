import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { hashToken } from '@/lib/crypto';
import { resetPasswordSchema, fieldErrors } from '@/lib/validators';
import { fail, ok } from '@/lib/api-helpers';
import { AuditActions, extractRequestMeta, logAuditEvent } from '@/lib/audit';
import { isDemoMode } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (isDemoMode()) return fail('Password resets are disabled in demo mode');

  const body = await request.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return fail(Object.values(fieldErrors(parsed.error))[0] ?? 'Invalid password reset request');
  }

  try {
    const storedToken = hashToken(parsed.data.token);
    const now = new Date();
    const user = await prisma.user.findFirst({
      where: {
        resetToken: storedToken,
        resetTokenExp: { gt: now },
        status: 'ACTIVE',
      },
      select: { id: true, businessId: true },
    });
    if (!user) return fail('This password reset link is invalid or has expired.', 400);

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    const consumed = await prisma.user.updateMany({
      where: {
        id: user.id,
        resetToken: storedToken,
        resetTokenExp: { gt: now },
      },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExp: null,
        loginAttempts: 0,
        lockedUntil: null,
      },
    });
    if (consumed.count !== 1) return fail('This password reset link is invalid or has expired.', 400);

    await logAuditEvent({
      businessId: user.businessId ?? undefined,
      userId: user.id,
      action: AuditActions.PASSWORD_RESET_COMPLETE,
      entityType: 'User',
      entityId: user.id,
      ...extractRequestMeta(request.headers),
    });

    return ok({ reset: true });
  } catch (error) {
    console.error('Password reset failed:', error);
    return fail('Unable to reset your password right now. Please try again later.', 503);
  }
}
