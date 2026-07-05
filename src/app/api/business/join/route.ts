// ============================================
// POST /api/business/join
// Employee self-registration: pick a business, prove
// membership with the shared business password, and
// get an active EMPLOYEE account.
// ============================================

import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { businessJoinSchema, fieldErrors } from '@/lib/validators';
import { logAuditEvent, AuditActions, extractRequestMeta } from '@/lib/audit';
import { ok, fail } from '@/lib/api-helpers';
import { isDemoMode } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (isDemoMode()) {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    return ok({ businessId: 'demo-business-1', email: body.email ?? 'cashier@addiscoffee.et' }, 201);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('Invalid request body');
  }

  const parsed = businessJoinSchema.safeParse(body);
  if (!parsed.success) {
    return fail(Object.values(fieldErrors(parsed.error))[0] ?? 'Invalid input');
  }
  const data = parsed.data;

  const business = await prisma.business.findUnique({
    where: { id: data.businessId },
    select: { id: true, legalName: true, status: true, joinPasswordHash: true },
  });
  if (!business || business.status !== 'ACTIVE' || !business.joinPasswordHash) {
    return fail('This business is not accepting new members', 404);
  }

  const passwordOk = await bcrypt.compare(data.businessPassword, business.joinPasswordHash);
  if (!passwordOk) return fail('Incorrect business password', 403);

  const existing = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (existing) return fail('An account with this email already exists', 409);

  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: {
      businessId: business.id,
      fullName: data.fullName,
      email: data.email,
      passwordHash,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    },
  });

  await logAuditEvent({
    businessId: business.id,
    userId: user.id,
    action: AuditActions.EMPLOYEE_CREATED,
    entityType: 'User',
    entityId: user.id,
    newValues: { fullName: data.fullName, email: data.email, via: 'self-join' },
    ...extractRequestMeta(req.headers),
  });

  return ok({ businessId: business.id, email: data.email }, 201);
}
