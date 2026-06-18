import type { Metadata } from 'next';
import { auth } from '@/auth';
import { getDashboardStats } from '@/lib/dashboard';
import { PROVIDER_LABELS } from '@/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Reports' };

export default async function ReportsPage() {
  const session = await auth();
  const stats = await getDashboardStats(session!.user.businessId!);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Activity over the last 7 days.</p>
        </div>
      </div>

      <div className="grid-2 mb-6">
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold">By provider</h3>
          </div>
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Verifications</th>
                  <th>Success rate</th>
                </tr>
              </thead>
              <tbody>
                {stats.providerBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center text-muted">
                      No data yet
                    </td>
                  </tr>
                ) : (
                  stats.providerBreakdown.map((p) => (
                    <tr key={p.provider}>
                      <td className="text-primary">{PROVIDER_LABELS[p.provider]}</td>
                      <td>{p.count}</td>
                      <td>{p.successRate}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold">By employee</h3>
          </div>
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Verifications</th>
                  <th>Success rate</th>
                </tr>
              </thead>
              <tbody>
                {stats.employeeBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center text-muted">
                      No data yet
                    </td>
                  </tr>
                ) : (
                  stats.employeeBreakdown.map((e) => (
                    <tr key={e.employeeId}>
                      <td className="text-primary">{e.employeeName}</td>
                      <td>{e.count}</td>
                      <td>{e.successRate}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
