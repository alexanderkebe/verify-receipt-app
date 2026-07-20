// GET /api/payment-accounts — list  |  POST — create
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { paymentAccountSchema, fieldErrors } from '@/lib/validators';
import { requireRole, ok, fail, handleError } from '@/lib/api-helpers';
import { isDemoMode, demoPaymentAccounts } from '@/lib/demo-data';
import { encrypt, maskAccountNumber } from '@/lib/crypto';
import { logAuditEvent, AuditActions, extractRequestMeta } from '@/lib/audit';
import { normalizeEthiopianMobile } from '@/lib/recipient-matching';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (isDemoMode()) return ok(demoPaymentAccounts);
  try {
    const ctx = await requireRole('OWNER', 'MANAGER');
    const accounts = await prisma.paymentAccount.findMany({
      where: { businessId: ctx.businessId! },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        provider: true,
        accountHolderName: true,
        accountNumberMasked: true,
        suffix: true,
        phoneNumber: true,
        nickname: true,
        status: true,
        ownershipStatus: true,
        createdAt: true,
      },
    });
    return ok(accounts);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  if (isDemoMode()) {
    const body = await req.json().catch(() => ({}));
    return ok({ id: `demo-acct-${Date.now()}`, provider: body.provider ?? 'CBE', accountNumberMasked: '****9999' }, 201);
  }
  try {
    const ctx = await requireRole('OWNER', 'MANAGER');
    const body = await req.json().catch(() => null);
    const parsed = paymentAccountSchema.safeParse(body);
    if (!parsed.success) {
      return fail(Object.values(fieldErrors(parsed.error))[0] ?? 'Invalid input');
    }
    const data = parsed.data;
    const normalizedTelebirrPhone =
      data.provider === 'TELEBIRR'
        ? normalizeEthiopianMobile(data.phoneNumber || data.accountNumber)
        : null;
    const phoneNumber =
      data.provider === 'TELEBIRR' && normalizedTelebirrPhone
        ? `251${normalizedTelebirrPhone}`
        : data.phoneNumber || null;

    const account = await prisma.paymentAccount.create({
      data: {
        businessId: ctx.businessId!,
        branchId: data.branchId || null,
        provider: data.provider,
        accountHolderName: data.accountHolderName,
        accountNumberEncrypted: encrypt(data.accountNumber),
        accountNumberMasked: maskAccountNumber(data.accountNumber),
        suffix: data.suffix || null,
        phoneNumber,
        nickname: data.nickname || null,
        status: 'ACTIVE',
      },
      select: { id: true, provider: true, accountNumberMasked: true },
    });

    await logAuditEvent({
      businessId: ctx.businessId!,
      userId: ctx.userId,
      action: AuditActions.PAYMENT_ACCOUNT_ADDED,
      entityType: 'PaymentAccount',
      entityId: account.id,
      newValues: { provider: account.provider, masked: account.accountNumberMasked },
      ...extractRequestMeta(req.headers),
    });

    return ok(account, 201);
  } catch (error) {
    return handleError(error);
  }
}
