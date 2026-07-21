import type { Metadata } from 'next';
import prisma from '@/lib/prisma';
import { isDemoMode, demoAdminBusinesses } from '@/lib/demo-data';
import BusinessesTable, { type Biz } from './BusinessesTable';
import type { SubscriptionTier } from '@/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Businesses' };

export default async function AdminBusinessesPage() {
  let items: Biz[];
  if (isDemoMode()) {
    items = demoAdminBusinesses.map((b) => ({
      id: b.id,
      legalName: b.legalName,
      tradingName: b.tradingName,
      email: b.email,
      status: b.status,
      tier: b.subscriptionTier as SubscriptionTier,
      usedThisMonth: 0,
      limit: 50,
      employees: b.userCount,
      verifications: b.verificationCount,
    }));
  } else {
    const businesses = await prisma.business.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        subscription: true,
        _count: { select: { users: true, verifications: true } },
      },
    });
    items = businesses.map((b) => ({
      id: b.id,
      legalName: b.legalName,
      tradingName: b.tradingName,
      email: b.email,
      status: b.status,
      tier: (b.subscription?.tier ?? 'FREE') as SubscriptionTier,
      usedThisMonth: b.subscription?.verificationsUsedThisMonth ?? 0,
      limit: b.subscription?.monthlyVerificationLimit ?? 50,
      employees: b._count.users,
      verifications: b._count.verifications,
    }));
  }

  return <BusinessesTable items={items} />;
}
