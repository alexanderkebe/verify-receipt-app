import type { Metadata } from 'next';
import Link from 'next/link';
import { auth } from '@/auth';
import { getCachedDashboardStats } from '@/lib/dashboard';
import { TrendChart, ProviderChart } from '@/components/dashboard/DashboardChartsLazy';
import { PROVIDER_LABELS, type ResultLevel } from '@/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Dashboard' };

const badgeClass: Record<ResultLevel, string> = {
  GREEN: 'badge-green',
  RED: 'badge-red',
  YELLOW: 'badge-yellow',
};

function fmt(n: number) {
  return n.toLocaleString();
}

export default async function DashboardPage() {
  const session = await auth();
  const businessId = session!.user.businessId!;
  const stats = await getCachedDashboardStats(businessId);

  const cards = [
    { label: 'Verifications today', value: fmt(stats.totalToday) },
    { label: 'Verified payments', value: fmt(stats.successfulToday) },
    { label: 'Value verified (ETB)', value: stats.totalValueVerified.toLocaleString(undefined, { maximumFractionDigits: 0 }) },
    { label: 'Rejected', value: fmt(stats.rejectedToday) },
    { label: 'Duplicates', value: fmt(stats.duplicatesDetected) },
    { label: 'Recipient mismatches', value: fmt(stats.recipientMismatches) },
    { label: 'Amount mismatches', value: fmt(stats.amountMismatches) },
    { label: 'Open fraud alerts', value: fmt(stats.unresolvedAlerts) },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Today&apos;s activity and recent trends.</p>
        </div>
        <Link href="/verify" className="btn btn-primary">
          Verify a receipt
        </Link>
      </div>

      <div className="grid-stats stagger mb-6">
        {cards.map((c) => (
          <div className="stat-card" key={c.label}>
            <span className="stat-label">{c.label}</span>
            <span className="stat-value">{c.value}</span>
          </div>
        ))}
      </div>

      <div className="grid-2 mb-6">
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold">Verifications — last 7 days</h3>
          </div>
          <div className="card-body">
            <TrendChart data={stats.trend} />
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold">By provider</h3>
          </div>
          <div className="card-body">
            <ProviderChart data={stats.providerBreakdown} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h3 className="font-semibold">Recent verifications</h3>
          <Link href="/history" className="text-sm">
            View all
          </Link>
        </div>
        <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Provider</th>
                <th>Employee</th>
                <th>Amount</th>
                <th>Result</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentVerifications.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <div className="empty-state-title">No verifications yet</div>
                      <div className="empty-state-text">Verify your first receipt to see activity here.</div>
                      <Link href="/verify" className="btn btn-primary">
                        Verify a receipt
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                stats.recentVerifications.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium text-primary">{r.referenceMasked}</td>
                    <td>{PROVIDER_LABELS[r.provider]}</td>
                    <td>{r.employeeName}</td>
                    <td>{r.amount !== null ? `${r.amount.toLocaleString()} ETB` : '—'}</td>
                    <td>
                      <span className={`badge ${badgeClass[r.resultLevel]}`}>{r.resultLevel}</span>
                    </td>
                    <td>{new Date(r.createdAt).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
