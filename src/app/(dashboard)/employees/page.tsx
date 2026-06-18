'use client';

import { useEffect, useState, useCallback } from 'react';
import { ROLE_LABELS, type UserRole, type UserStatus } from '@/types';

interface Employee {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  employeeCode: string | null;
  role: UserRole;
  status: UserStatus;
  lastLogin: string | null;
}

const statusBadge: Record<UserStatus, string> = {
  ACTIVE: 'badge-green',
  PENDING: 'badge-yellow',
  SUSPENDED: 'badge-red',
  DEACTIVATED: 'badge-neutral',
};

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/employees');
    const json = await res.json();
    setLoading(false);
    if (json.success) setEmployees(json.data);
    else setError(json.error || 'Failed to load employees');
  }, []);

  useEffect(() => {
    // Initial fetch on mount; all setState calls occur after await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function setStatus(id: string, status: UserStatus) {
    const res = await fetch(`/api/employees/${id}`, {
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
          <h1 className="page-title">Employees</h1>
          <p className="page-subtitle">Manage who can verify receipts for your business.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          Add employee
        </button>
      </div>

      {error && <div className="alert alert-danger mb-4">{error}</div>}

      {loading ? (
        <div className="flex justify-center p-8">
          <span className="spinner spinner-lg" />
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last login</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id}>
                  <td className="font-medium text-primary">
                    {e.fullName}
                    {e.jobTitle && <span className="text-xs text-muted"> · {e.jobTitle}</span>}
                  </td>
                  <td>{e.email}</td>
                  <td>{ROLE_LABELS[e.role]}</td>
                  <td>
                    <span className={`badge ${statusBadge[e.status]}`}>{e.status}</span>
                  </td>
                  <td>{e.lastLogin ? new Date(e.lastLogin).toLocaleDateString() : '—'}</td>
                  <td className="text-right">
                    {e.role !== 'OWNER' &&
                      (e.status === 'ACTIVE' ? (
                        <button className="btn btn-ghost btn-sm" onClick={() => setStatus(e.id, 'SUSPENDED')}>
                          Suspend
                        </button>
                      ) : (
                        <button className="btn btn-ghost btn-sm" onClick={() => setStatus(e.id, 'ACTIVE')}>
                          Activate
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && <AddEmployeeModal onClose={() => setShowAdd(false)} onCreated={load} />}
    </>
  );
}

function AddEmployeeModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', jobTitle: '', role: 'EMPLOYEE' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: form.fullName,
        email: form.email,
        phone: form.phone || undefined,
        jobTitle: form.jobTitle || undefined,
        role: form.role,
      }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok || !json.success) {
      setError(json.error || 'Failed to create employee');
      return;
    }
    setTempPassword(json.data.tempPassword);
    onCreated();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{tempPassword ? 'Employee added' : 'Add employee'}</h3>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        {tempPassword ? (
          <div className="modal-body">
            <div className="alert alert-success mb-4">Account created. Share these credentials securely.</div>
            <p className="text-sm text-secondary mb-2">Email: {form.email}</p>
            <p className="text-sm text-secondary">
              Temporary password: <strong className="text-primary">{tempPassword}</strong>
            </p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="modal-body flex flex-col gap-4">
              {error && <div className="alert alert-danger">{error}</div>}
              <div className="input-group">
                <label className="input-label">Full name<span className="required">*</span></label>
                <input
                  className="input-field"
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  required
                />
              </div>
              <div className="input-group">
                <label className="input-label">Email<span className="required">*</span></label>
                <input
                  type="email"
                  className="input-field"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div className="input-group">
                <label className="input-label">Phone</label>
                <input
                  className="input-field"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Job title</label>
                <input
                  className="input-field"
                  value={form.jobTitle}
                  onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Role</label>
                <select
                  className="input-field select-field"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  <option value="EMPLOYEE">Employee</option>
                  <option value="MANAGER">Manager</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? <span className="spinner spinner-sm" /> : 'Create'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
