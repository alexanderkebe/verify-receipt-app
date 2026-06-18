import type { Metadata } from 'next';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Audit Log' };

export default async function AuditPage() {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      user: { select: { fullName: true, email: true } },
      business: { select: { legalName: true } },
    },
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Log</h1>
          <p className="page-subtitle">The 100 most recent platform events.</p>
        </div>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Entity</th>
              <th>User</th>
              <th>Business</th>
              <th>IP</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">
                    <div className="empty-state-title">No audit events</div>
                    <div className="empty-state-text">Activity will appear here as the platform is used.</div>
                  </div>
                </td>
              </tr>
            ) : (
              logs.map((l) => (
                <tr key={l.id}>
                  <td className="font-medium text-primary">{l.action}</td>
                  <td>{l.entityType}</td>
                  <td>{l.user?.fullName ?? l.user?.email ?? 'System'}</td>
                  <td>{l.business?.legalName ?? '—'}</td>
                  <td className="text-xs text-muted">{l.ipAddress ?? '—'}</td>
                  <td>{new Date(l.createdAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
