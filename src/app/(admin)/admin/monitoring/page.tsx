import type { Metadata } from 'next';
import prisma from '@/lib/prisma';
import { getCachedApiHealth } from '@/lib/verifier-api';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Monitoring' };

async function getMonitoring() {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [health, last24h, failures24h] = await Promise.all([
    getCachedApiHealth(),
    prisma.receiptVerification.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.receiptVerification.count({
      where: { createdAt: { gte: dayAgo }, verificationStatus: { in: ['ERROR', 'TIMEOUT'] } },
    }),
  ]);
  return { health, last24h, failures24h };
}

export default async function MonitoringPage() {
  const { health, last24h, failures24h } = await getMonitoring();
  const errorRate = last24h > 0 ? Math.round((failures24h / last24h) * 100) : 0;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">System Monitoring</h1>
          <p className="page-subtitle">Verifier API status and request volume.</p>
        </div>
      </div>

      <div className="grid-stats mb-6">
        <div className="stat-card">
          <span className="stat-label">Verifier API</span>
          <span className="stat-value" style={{ fontSize: 'var(--font-size-xl)' }}>
            <span className={`badge ${health.healthy ? 'badge-green' : 'badge-red'}`}>
              {health.healthy ? 'Online' : 'Offline'}
            </span>
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">API response time</span>
          <span className="stat-value">{health.responseTime}ms</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Requests (24h)</span>
          <span className="stat-value">{last24h.toLocaleString()}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Error rate (24h)</span>
          <span className="stat-value">{errorRate}%</span>
        </div>
      </div>

      <div className="alert alert-info">
        The verification flow depends on the external Vixen878 Verifier API. If it is offline, verifications
        return &ldquo;unable to verify&rdquo; and are surfaced to employees as YELLOW results.
      </div>
    </>
  );
}
