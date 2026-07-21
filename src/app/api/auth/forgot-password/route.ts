import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { AUTH_CONFIG } from '@/lib/constants';
import { generateToken, hashToken } from '@/lib/crypto';
import { forgotPasswordSchema, fieldErrors } from '@/lib/validators';
import { fail, ok } from '@/lib/api-helpers';
import { AuditActions, extractRequestMeta, logAuditEvent } from '@/lib/audit';
import { isDemoMode } from '@/lib/demo-data';
import { consumePasswordResetQuota } from '@/lib/password-reset-rate-limit';
import { isPasswordEmailConfigured, sendPasswordResetEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;

const GENERIC_MESSAGE = 'If an active account exists for that email, we sent a password reset link.';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return fail(Object.values(fieldErrors(parsed.error))[0] ?? 'Enter a valid email address');
  }

  if (isDemoMode()) return ok({ message: GENERIC_MESSAGE });

  const meta = extractRequestMeta(request.headers);
  const quota = consumePasswordResetQuota(parsed.data.email, meta.ipAddress);
  if (!quota.allowed) {
    return NextResponse.json(
      { success: false, error: 'Too many reset requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(quota.retryAfterSeconds) } },
    );
  }

  const emailConfigured = isPasswordEmailConfigured();
  if (!emailConfigured && process.env.NODE_ENV === 'production') {
    console.error('Password recovery requested but Resend is not configured');
    return fail('Password recovery is temporarily unavailable. Please contact support.', 503);
  }

  try {
    const user = await prisma.user.findFirst({
      where: { email: parsed.data.email, status: 'ACTIVE' },
      select: { id: true, businessId: true, email: true, fullName: true },
    });

    if (!user) return ok({ message: GENERIC_MESSAGE });

    const rawToken = generateToken();
    const storedToken = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + AUTH_CONFIG.resetTokenExpMinutes * 60_000);
    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: storedToken, resetTokenExp: expiresAt },
    });

    await logAuditEvent({
      businessId: user.businessId ?? undefined,
      userId: user.id,
      action: AuditActions.PASSWORD_RESET_REQUEST,
      entityType: 'User',
      entityId: user.id,
      ...meta,
    });

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || request.nextUrl.origin)
      .replace(/\/$/, '');
    const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

    if (!emailConfigured) {
      return ok({ message: GENERIC_MESSAGE, devResetUrl: resetUrl });
    }

    try {
      await sendPasswordResetEmail({
        to: user.email,
        name: user.fullName,
        resetUrl,
        idempotencyKey: `password-reset/${storedToken}`,
      });
    } catch (error) {
      await prisma.user.updateMany({
        where: { id: user.id, resetToken: storedToken },
        data: { resetToken: null, resetTokenExp: null },
      });
      console.error('Password recovery email delivery failed:', error);
    }

    return ok({ message: GENERIC_MESSAGE });
  } catch (error) {
    console.error('Password recovery request failed:', error);
    return fail('Password recovery is temporarily unavailable. Please try again later.', 503);
  }
}
