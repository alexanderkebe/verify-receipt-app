// ============================================
// POST /api/business/register
// Self-registration: Business + owner User + first
// PaymentAccount + FREE Subscription, in one transaction.
// ============================================

import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { registerSchema, fieldErrors } from '@/lib/validators';
import { encrypt, maskAccountNumber } from '@/lib/crypto';
import { logAuditEvent, AuditActions, extractRequestMeta } from '@/lib/audit';
import { ok, fail } from '@/lib/api-helpers';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
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
    prisma.user.findUnique({ where: { email: data.ownerEmail }, select: { id: true } }),
  ]);
  if (bizExists) return fail('A business with this email already exists', 409);
  if (ownerExists) return fail('An account with this owner email already exists', 409);

  const passwordHash = await bcrypt.hash(data.ownerPassword, 10);

  try {
    const business = await prisma.$transaction(async (tx) => {
      const biz = await tx.business.create({
        data: {
          legalName: data.legalName,
          tradingName: data.tradingName || null,
          businessType: data.businessType,
          sector: data.sector || null,
          phone: data.phone,
          email: data.email,
          city: data.city || null,
          region: data.region || null,
          address: data.address || null,
          status: 'ACTIVE', // self-registration, no manual approval (Q2)
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
          fullName: data.ownerName,
          email: data.ownerEmail,
          phone: data.phone,
          passwordHash,
          jobTitle: 'Owner',
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });

      if (data.account) {
        await tx.paymentAccount.create({
          data: {
            businessId: biz.id,
            provider: data.account.provider,
            accountHolderName: data.account.accountHolderName,
            accountNumberEncrypted: encrypt(data.account.accountNumber),
            accountNumberMasked: maskAccountNumber(data.account.accountNumber),
            suffix: data.account.suffix || null,
            phoneNumber: data.account.phoneNumber || null,
            nickname: data.account.nickname || null,
            status: 'ACTIVE',
          },
        });
      }

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

    return ok({ businessId: business.id, email: data.ownerEmail }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return fail('Invalid input');
    console.error('Registration failed:', error);
    return fail('Registration failed. Please try again.', 500);
  }
}
