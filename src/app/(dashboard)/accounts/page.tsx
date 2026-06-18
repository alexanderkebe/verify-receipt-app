'use client';

import { useEffect, useState, useCallback } from 'react';
import { PROVIDER_LABELS, type Provider, type UserStatus } from '@/types';
import { PROVIDER_REQUIRED_FIELDS } from '@/lib/constants';

interface Account {
  id: string;
  provider: Provider;
  accountHolderName: string;
  accountNumberMasked: string;
  suffix: string | null;
  phoneNumber: string | null;
  nickname: string | null;
  status: UserStatus;
}

const PROVIDERS = Object.keys(PROVIDER_LABELS) as Provider[];
const statusBadge: Record<string, string> = { ACTIVE: 'badge-green', SUSPENDED: 'badge-red', DEACTIVATED: 'badge-neutral', PENDING: 'badge-yellow' };

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/payment-accounts');
    const json = await res.json();
    setLoading(false);
    if (json.success) setAccounts(json.data);
  }, []);

  useEffect(() => {
    // Initial fetch on mount; all setState calls occur after await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function toggle(id: string, status: UserStatus) {
    const res = await fetch(`/api/payment-accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status === 'ACTIVE' ? 'DEACTIVATED' : 'ACTIVE' }),
    });
    if (res.ok) load();
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Payment Accounts</h1>
          <p className="page-subtitle">Receipts are matched against these accounts.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          Add account
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-8">
          <span className="spinner spinner-lg" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-title">No payment accounts</div>
          <div className="empty-state-text">Add the account customers pay into so receipts can be matched.</div>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            Add account
          </button>
        </div>
      ) : (
        <div className="grid-3 stagger">
          {accounts.map((a) => (
            <div className="card card-padding" key={a.id}>
              <div className="flex items-center justify-between mb-4">
                <span className="badge badge-blue">{PROVIDER_LABELS[a.provider]}</span>
                <span className={`badge ${statusBadge[a.status]}`}>{a.status}</span>
              </div>
              <div className="text-lg font-semibold text-primary">{a.accountNumberMasked}</div>
              <div className="text-sm text-secondary">{a.accountHolderName}</div>
              {a.nickname && <div className="text-xs text-muted mt-1">{a.nickname}</div>}
              <button className="btn btn-ghost btn-sm mt-4" onClick={() => toggle(a.id, a.status)}>
                {a.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          ))}
        </div>
      )}

      {showAdd && <AddAccountModal onClose={() => setShowAdd(false)} onCreated={load} />}
    </>
  );
}

function AddAccountModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    provider: 'CBE' as Provider,
    accountHolderName: '',
    accountNumber: '',
    suffix: '',
    phoneNumber: '',
    nickname: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const required = PROVIDER_REQUIRED_FIELDS[form.provider];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch('/api/payment-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: form.provider,
        accountHolderName: form.accountHolderName,
        accountNumber: form.accountNumber,
        suffix: form.suffix || undefined,
        phoneNumber: form.phoneNumber || undefined,
        nickname: form.nickname || undefined,
      }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok || !json.success) {
      setError(json.error || 'Failed to add account');
      return;
    }
    onCreated();
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Add payment account</h3>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body flex flex-col gap-4">
            {error && <div className="alert alert-danger">{error}</div>}
            <div className="input-group">
              <label className="input-label">Provider</label>
              <select
                className="input-field select-field"
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value as Provider })}
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Account holder name<span className="required">*</span></label>
              <input
                className="input-field"
                value={form.accountHolderName}
                onChange={(e) => setForm({ ...form, accountHolderName: e.target.value })}
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">Account / phone number<span className="required">*</span></label>
              <input
                className="input-field"
                value={form.accountNumber}
                onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                required
              />
            </div>
            {required.includes('suffix') && (
              <div className="input-group">
                <label className="input-label">Suffix</label>
                <input
                  className="input-field"
                  value={form.suffix}
                  onChange={(e) => setForm({ ...form, suffix: e.target.value })}
                  placeholder={form.provider === 'CBE' ? '8-digit' : '5-digit'}
                />
              </div>
            )}
            {required.includes('phoneNumber') && (
              <div className="input-group">
                <label className="input-label">Phone number</label>
                <input
                  className="input-field"
                  value={form.phoneNumber}
                  onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                  placeholder="2519XXXXXXXX"
                />
              </div>
            )}
            <div className="input-group">
              <label className="input-label">Nickname</label>
              <input
                className="input-field"
                value={form.nickname}
                onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                placeholder="Optional label"
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <span className="spinner spinner-sm" /> : 'Add account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
