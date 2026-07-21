'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TIER_LABELS, type SubscriptionTier } from '@/types';

export interface Biz {
  id: string;
  legalName: string;
  tradingName: string | null;
  email: string;
  status: string;
  tier: SubscriptionTier;
  usedThisMonth: number;
  limit: number;
  employees: number;
  verifications: number;
}

const statusBadge: Record<string, string> = {
  ACTIVE: 'badge-green',
  SUSPENDED: 'badge-red',
  DEACTIVATED: 'badge-neutral',
  PENDING_VERIFICATION: 'badge-yellow',
};
const TIERS: SubscriptionTier[] = ['FREE', 'BASIC', 'PRO'];

export default function BusinessesTable({ items }: { items: Biz[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function patch(id: string, payload: Record<string, string>) {
    const res = await fetch(`/api/admin/businesses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) router.refresh();
    else setError('Failed to update the business');
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Businesses</h1>
          <p className="page-subtitle">{items.length} registered</p>
        </div>
      </div>

      {error && <div className="alert alert-danger mb-4">{error}</div>}

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Business</th>
              <th>Status</th>
              <th>Plan</th>
              <th>Usage</th>
              <th>Employees</th>
              <th>Verifications</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr key={b.id}>
                <td className="font-medium text-primary">
                  {b.tradingName || b.legalName}
                  <div className="text-xs text-muted">{b.email}</div>
                </td>
                <td>
                  <span className={`badge ${statusBadge[b.status] ?? 'badge-neutral'}`}>{b.status}</span>
                </td>
                <td>
                  <select
                    className="input-field select-field btn-sm"
                    style={{ padding: '4px 24px 4px 8px', width: 'auto' }}
                    value={b.tier}
                    onChange={(e) => patch(b.id, { tier: e.target.value })}
                  >
                    {TIERS.map((t) => (
                      <option key={t} value={t}>
                        {TIER_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{b.limit === -1 ? `${b.usedThisMonth} (∞)` : `${b.usedThisMonth}/${b.limit}`}</td>
                <td>{b.employees}</td>
                <td>{b.verifications}</td>
                <td className="text-right">
                  {b.status === 'ACTIVE' ? (
                    <button className="btn btn-ghost btn-sm" onClick={() => patch(b.id, { status: 'SUSPENDED' })}>
                      Suspend
                    </button>
                  ) : (
                    <button className="btn btn-ghost btn-sm" onClick={() => patch(b.id, { status: 'ACTIVE' })}>
                      Activate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
