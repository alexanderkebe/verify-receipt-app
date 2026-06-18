'use client';

import { useEffect, useState, useCallback } from 'react';
import { SEVERITY_LABELS, type AlertSeverity, type AlertStatus, type AlertType, type Provider } from '@/types';
import { PROVIDER_LABELS } from '@/types';

interface Alert {
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

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch('/api/alerts');
    const json = await res.json();
    setLoading(false);
    if (json.success) setAlerts(json.data);
  }, []);

  useEffect(() => {
    // Initial fetch on mount; all setState calls occur after await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function update(id: string, status: AlertStatus) {
    const res = await fetch(`/api/alerts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) load();
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Fraud Alerts</h1>
          <p className="page-subtitle">Review and resolve suspicious activity.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-8">
          <span className="spinner spinner-lg" />
        </div>
      ) : alerts.length === 0 ? (
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
