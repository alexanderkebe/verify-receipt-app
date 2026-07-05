// ============================================
// POST /api/business/register
// Business self-registration: business name, owner login, a shared
// business password for employees, and ALL payment accounts the
// business receives money with (CBE, Telebirr, Dashen, …).
// Suffixes/phone formats are derived from the account numbers.
// ============================================

import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { registerSchema, fieldErrors } from '@/lib/validators';
import { encrypt, maskAccountNumber } from '@/lib/crypto';
import { logAuditEvent, AuditActions, extractRequestMeta } from '@/lib/audit';
import { ok, fail } from '@/lib/api-helpers';
import { isDemoMode } from '@/lib/demo-data';
import type { Provider } from '@/types';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const MOBILE_MONEY: Provider[] = ['TELEBIRR', 'CBE_BIRR', 'MPESA'];

function deriveAccountFields(provider: Provider, accountNumber: string) {
  const digits = accountNumber.replace(/[^0-9]/g, '');
  const suffix =
    provider === 'CBE' ? digits.slice(-8) :
    provider === 'ABYSSINIA' ? digits.slice(-5) :
    null;
  const phoneNumber =
    MOBILE_MONEY.includes(provider) && /^(251|0)?9\d{8}$/.test(digits)
      ? `251${digits.slice(-9)}`
      : null;
  return { suffix, phoneNumber };
}

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

  const [passwordHash, joinPasswordHash] = await Promise.all([
    bcrypt.hash(data.password, 10),
    bcrypt.hash(data.businessPassword, 10),
  ]);

  const firstPhone = data.accounts
    .map((a) => deriveAccountFields(a.provider, a.accountNumber).phoneNumber)
    .find(Boolean);

  try {
    const business = await prisma.$transaction(async (tx) => {
      // (generous timeout below — every query crosses an intercontinental pooler)
      const biz = await tx.business.create({
        data: {
          legalName: data.businessName,
          businessType: 'General',
          phone: firstPhone ?? '',
          email: data.email,
          status: 'ACTIVE', // self-registration, no manual approval
          joinPasswordHash,
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
          email: data.email,
          passwordHash,
          jobTitle: 'Owner',
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });

      await tx.paymentAccount.createMany({
        data: data.accounts.map((account) => {
          const { suffix, phoneNumber } = deriveAccountFields(account.provider, account.accountNumber);
          return {
            businessId: biz.id,
            provider: account.provider,
            accountHolderName: account.accountHolderName,
            accountNumberEncrypted: encrypt(account.accountNumber),
            accountNumberMasked: maskAccountNumber(account.accountNumber),
            suffix,
            phoneNumber,
            status: 'ACTIVE' as const,
          };
        }),
      });

      return biz;
    }, { timeout: 20000, maxWait: 10000 });

    await logAuditEvent({
      businessId: business.id,
      action: AuditActions.BUSINESS_REGISTERED,
      entityType: 'Business',
      entityId: business.id,
      newValues: { legalName: business.legalName, email: business.email, accounts: data.accounts.length },
      ...extractRequestMeta(req.headers),
    });

    return ok({ businessId: business.id, email: data.email }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return fail('Invalid input');
    console.error('Registration failed:', error);
    return fail('Registration failed. Please try again.', 500);
  }
}
