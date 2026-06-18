'use client';

import { useEffect, useState, useCallback } from 'react';
import { TIER_LABELS, type SubscriptionTier } from '@/types';

interface Biz {
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

export default function AdminBusinessesPage() {
  const [items, setItems] = useState<Biz[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/businesses');
    const json = await res.json();
    if (json.success) setItems(json.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function patch(id: string, payload: Record<string, string>) {
    const res = await fetch(`/api/admin/businesses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) load();
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Businesses</h1>
          <p className="page-subtitle">{items.length} registered</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-8">
          <span className="spinner spinner-lg" />
        </div>
      ) : (
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
      )}
    </>
  );
}
