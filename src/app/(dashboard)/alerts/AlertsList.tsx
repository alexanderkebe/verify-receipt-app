'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SEVERITY_LABELS, PROVIDER_LABELS, type AlertSeverity, type AlertStatus, type AlertType, type Provider } from '@/types';

export interface Alert {
  id: string;
  severity: AlertSeverity;
  alertType: AlertType;
  status: AlertStatus;
  description: string;
  resolution: string | null;
  createdAt: string;
  reference: string;
  provider: Provider;
  payerName: string | null;
  amount: number | null;
}

const severityBadge: Record<AlertSeverity, string> = {
  INFORMATIONAL: 'badge-blue',
  WARNING: 'badge-yellow',
  HIGH_RISK: 'badge-red',
  CRITICAL: 'badge-red',
};

const statusBadge: Record<AlertStatus, string> = {
  OPEN: 'badge-yellow',
  ASSIGNED: 'badge-blue',
  RESOLVED: 'badge-green',
  DISMISSED: 'badge-neutral',
};

export default function AlertsList({ alerts }: { alerts: Alert[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function update(id: string, status: AlertStatus) {
    const res = await fetch(`/api/alerts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) router.refresh();
    else setError('Failed to update the alert');
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Fraud Alerts</h1>
          <p className="page-subtitle">Review and resolve suspicious activity.</p>
        </div>
      </div>

      {error && <div className="alert alert-danger mb-4">{error}</div>}

      {alerts.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-title">No alerts</div>
          <div className="empty-state-text">You&apos;re all clear — no fraud alerts have been raised.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {alerts.map((a) => (
            <div className="card card-padding" key={a.id}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`badge ${severityBadge[a.severity]}`}>{SEVERITY_LABELS[a.severity]}</span>
                  <span className={`badge ${statusBadge[a.status]}`}>{a.status}</span>
                </div>
                <span className="text-xs text-muted">{new Date(a.createdAt).toLocaleString()}</span>
              </div>
              <div className="text-sm text-primary mb-1">{a.description}</div>
              <div className="text-xs text-muted">
                {PROVIDER_LABELS[a.provider]} · {a.reference}
                {a.payerName ? ` · ${a.payerName}` : ''}
                {a.amount !== null ? ` · ${a.amount.toLocaleString()} ETB` : ''}
              </div>
              {a.status !== 'RESOLVED' && a.status !== 'DISMISSED' && (
                <div className="flex gap-2 mt-3">
                  <button className="btn btn-success btn-sm" onClick={() => update(a.id, 'RESOLVED')}>
                    Resolve
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => update(a.id, 'DISMISSED')}>
                    Dismiss
                  </button>
                </div>
              )}
              {a.resolution && <div className="text-xs text-secondary mt-2">Resolution: {a.resolution}</div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
