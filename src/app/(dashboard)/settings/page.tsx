import type { Metadata } from 'next';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { SUBSCRIPTION_CONFIG } from '@/lib/constants';
import type { SubscriptionTier } from '@/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const session = await auth();
  const businessId = session!.user.businessId!;
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { subscription: true },
  });

  if (!business) {
    return <div className="alert alert-danger">Business not found.</div>;
  }

  const tier = (business.subscription?.tier ?? 'FREE') as SubscriptionTier;
  const cfg = SUBSCRIPTION_CONFIG[tier];
  const used = business.subscription?.verificationsUsedThisMonth ?? 0;
  const limit = business.subscription?.monthlyVerificationLimit ?? 50;
  const pct = limit === -1 ? 0 : Math.min(100, Math.round((used / limit) * 100));

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Your business profile and subscription.</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="card card-padding">
          <h3 className="font-semibold mb-4">Business profile</h3>
          <Row label="Legal name" value={business.legalName} />
          <Row label="Trading name" value={business.tradingName ?? '—'} />
          <Row label="Type" value={business.businessType} />
          <Row label="Email" value={business.email} />
          <Row label="Phone" value={business.phone} />
          <Row label="City" value={business.city ?? '—'} />
          <Row label="Status" value={business.status} />
        </div>

        <div className="card card-padding">
          <h3 className="font-semibold mb-4">Subscription</h3>
          <div className="flex items-center justify-between mb-2">
            <span className="badge badge-blue">{cfg.label} plan</span>
            <span className="text-sm text-secondary">{cfg.price}</span>
          </div>
          <div className="text-sm text-secondary mb-2">
            {limit === -1 ? `${used} verifications this month (unlimited)` : `${used} / ${limit} verifications this month`}
          </div>
          {limit !== -1 && (
            <div className="progress-bar mb-4">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
          )}
          <ul className="flex flex-col gap-2 mt-4">
            {cfg.features.map((f) => (
              <li key={f} className="text-sm text-secondary">
                ✓ {f}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm text-primary font-medium">{value}</span>
    </div>
  );
}
