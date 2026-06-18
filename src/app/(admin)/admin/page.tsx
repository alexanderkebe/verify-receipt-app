import type { Metadata } from 'next';
import Link from 'next/link';
import prisma from '@/lib/prisma';
import { checkApiHealth } from '@/lib/verifier-api';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Admin Overview' };

async function getOverview() {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [health, businesses, activeBusinesses, totalVerifications, last24h] = await Promise.all([
    checkApiHealth(),
    prisma.business.count(),
    prisma.business.count({ where: { status: 'ACTIVE' } }),
    prisma.receiptVerification.count(),
    prisma.receiptVerification.count({ where: { createdAt: { gte: dayAgo } } }),
  ]);
  return { health, businesses, activeBusinesses, totalVerifications, last24h };
}

export default async function AdminOverviewPage() {
  const { health, businesses, activeBusinesses, totalVerifications, last24h } = await getOverview();

  const cards = [
    { label: 'Businesses', value: businesses.toLocaleString() },
    { label: 'Active businesses', value: activeBusinesses.toLocaleString() },
    { label: 'Total verifications', value: totalVerifications.toLocaleString() },
    { label: 'Verifications (24h)', value: last24h.toLocaleString() },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Overview</h1>
          <p className="page-subtitle">Platform-wide activity at a glance.</p>
        </div>
        <span className={`badge ${health.healthy ? 'badge-green' : 'badge-red'}`}>
          Verifier API {health.healthy ? 'online' : 'offline'}
        </span>
      </div>

      <div className="grid-stats stagger mb-6">
        {cards.map((c) => (
          <div className="stat-card" key={c.label}>
            <span className="stat-label">{c.label}</span>
            <span className="stat-value">{c.value}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <Link href="/admin/businesses" className="btn btn-primary">
          Manage businesses
        </Link>
        <Link href="/admin/monitoring" className="btn btn-secondary">
          System monitoring
        </Link>
        <Link href="/admin/audit" className="btn btn-secondary">
          Audit log
        </Link>
      </div>
    </>
  );
}
