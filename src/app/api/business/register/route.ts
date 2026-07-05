// ============================================
// POST /api/business/register
// Simple self-registration: business name, bank, account holder
// name, account number, email and password. Creates the Business,
// owner User, first PaymentAccount and FREE Subscription in one
// transaction. Suffixes are derived from the account number.
// ============================================

import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { registerSchema, fieldErrors } from '@/lib/validators';
import { encrypt, maskAccountNumber } from '@/lib/crypto';
import { logAuditEvent, AuditActions, extractRequestMeta } from '@/lib/audit';
import { ok, fail } from '@/lib/api-helpers';
import { isDemoMode } from '@/lib/demo-data';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (isDemoMode()) {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    return ok({ businessId: 'demo-business-1', email: body.email ?? 'demo@addiscoffee.et' }, 201);
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('Invalid request body');
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return fail(Object.values(fieldErrors(parsed.error))[0] ?? 'Invalid input');
  }
  const data = parsed.data;

  // Uniqueness checks (friendly errors before hitting DB constraints)
  const [bizExists, ownerExists] = await Promise.all([
    prisma.business.findUnique({ where: { email: data.email }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: data.email }, select: { id: true } }),
  ]);
  if (bizExists || ownerExists) return fail('An account with this email already exists', 409);

  const passwordHash = await bcrypt.hash(data.password, 10);

  const digits = data.accountNumber.replace(/[^0-9]/g, '');
  // Derive the verification suffix from the account number
  const suffix =
    data.provider === 'CBE' ? digits.slice(-8) :
    data.provider === 'ABYSSINIA' ? digits.slice(-5) :
    null;
  const isMobileMoney = data.provider === 'CBE_BIRR' || data.provider === 'TELEBIRR' || data.provider === 'MPESA';
  const phoneNumber = isMobileMoney && /^(251|0)?9\d{8}$/.test(digits)
    ? `251${digits.slice(-9)}`
    : null;

  try {
    const business = await prisma.$transaction(async (tx) => {
      const biz = await tx.business.create({
        data: {
          legalName: data.businessName,
          businessType: 'General',
          phone: phoneNumber ?? '',
          email: data.email,
          status: 'ACTIVE', // self-registration, no manual approval
          tosAcceptedAt: new Date(),
          subscription: {
            create: {
              tier: 'FREE',
              monthlyVerificationLimit: 50,
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          },
        },
      });

      await tx.user.create({
        data: {
          businessId: biz.id,
          fullName: data.accountHolderName,
          email: data.email,
          passwordHash,
          jobTitle: 'Owner',
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });

      await tx.paymentAccount.create({
        data: {
          businessId: biz.id,
          provider: data.provider,
          accountHolderName: data.accountHolderName,
          accountNumberEncrypted: encrypt(data.accountNumber),
          accountNumberMasked: maskAccountNumber(data.accountNumber),
          suffix,
          phoneNumber,
          status: 'ACTIVE',
        },
      });

      return biz;
    });

    await logAuditEvent({
      businessId: business.id,
      action: AuditActions.BUSINESS_REGISTERED,
      entityType: 'Business',
      entityId: business.id,
      newValues: { legalName: business.legalName, email: business.email },
      ...extractRequestMeta(req.headers),
    });

    return ok({ businessId: business.id, email: data.email }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return fail('Invalid input');
    console.error('Registration failed:', error);
    return fail('Registration failed. Please try again.', 500);
  }
}
