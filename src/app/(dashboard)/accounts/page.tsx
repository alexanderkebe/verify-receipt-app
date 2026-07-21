import type { Metadata } from 'next';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { isDemoMode, demoPaymentAccounts } from '@/lib/demo-data';
import AccountsView, { type Account } from './AccountsView';
import type { Provider, UserStatus } from '@/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Payment Accounts' };

export default async function AccountsPage() {
  let accounts: Account[];
  if (isDemoMode()) {
    accounts = demoPaymentAccounts as Account[];
  } else {
    const session = await auth();
    const rows = await prisma.paymentAccount.findMany({
      where: { businessId: session!.user.businessId! },
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
      },
    });
    accounts = rows.map((a) => ({
      ...a,
      provider: a.provider as Provider,
      status: a.status as UserStatus,
    }));
  }

  return <AccountsView accounts={accounts} />;
}
