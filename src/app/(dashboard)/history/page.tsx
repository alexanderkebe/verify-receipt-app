import type { Metadata } from 'next';
import { auth } from '@/auth';
import { getHistory } from '@/lib/history';
import { PROVIDER_LABELS, type Provider, type ResultLevel } from '@/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'History' };

const badgeClass: Record<ResultLevel, string> = {
  GREEN: 'badge-green',
  RED: 'badge-red',
  YELLOW: 'badge-yellow',
};

type SP = Record<string, string | string[] | undefined>;

function str(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function HistoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const session = await auth();
  const ctx = session!.user;

  const page = Number(str(sp.page) ?? '1') || 1;
  const provider = str(sp.provider) as Provider | undefined;
  const resultLevel = str(sp.resultLevel) as ResultLevel | undefined;
  const reference = str(sp.reference);

  const data = await getHistory(
    { businessId: ctx.businessId!, role: ctx.role, userId: ctx.id },
    { page, provider, resultLevel, reference },
  );

  const providers = Object.keys(PROVIDER_LABELS) as Provider[];

  const exportParams = new URLSearchParams();
  if (provider) exportParams.set('provider', provider);
  if (resultLevel) exportParams.set('resultLevel', resultLevel);
  if (reference) exportParams.set('reference', reference);
  const exportHref = `/api/history/export?${exportParams.toString()}`;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Verification History</h1>
          <p className="page-subtitle">
            {data.total} record{data.total === 1 ? '' : 's'}
          </p>
        </div>
        <a className="btn btn-secondary" href={exportHref}>
          Export CSV
        </a>
      </div>

      <form method="get" className="card card-padding mb-6">
        <div className="grid-4" style={{ alignItems: 'end' }}>
          <div className="input-group">
            <label className="input-label">Reference</label>
            <input className="input-field" name="reference" defaultValue={reference ?? ''} placeholder="Search…" />
          </div>
          <div className="input-group">
            <label className="input-label">Provider</label>
            <select className="input-field select-field" name="provider" defaultValue={provider ?? ''}>
              <option value="">All</option>
              {providers.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">Result</label>
            <select className="input-field select-field" name="resultLevel" defaultValue={resultLevel ?? ''}>
              <option value="">All</option>
              <option value="GREEN">Verified</option>
              <option value="RED">Issue</option>
              <option value="YELLOW">Unable to verify</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary">
            Apply filters
          </button>
        </div>
      </form>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Provider</th>
              <th>Payer</th>
              <th>Employee</th>
              <th>Amount</th>
              <th>Result</th>
              <th>Decision</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">
                    <div className="empty-state-title">No records found</div>
                    <div className="empty-state-text">Try adjusting your filters.</div>
                  </div>
                </td>
              </tr>
            ) : (
              data.items.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium text-primary">{r.referenceMasked}</td>
                  <td>{PROVIDER_LABELS[r.provider]}</td>
                  <td>{r.payerName ?? '—'}</td>
                  <td>{r.employeeName}</td>
                  <td>{r.verifiedAmount !== null ? `${r.verifiedAmount.toLocaleString()} ETB` : '—'}</td>
                  <td>
                    <span className={`badge ${badgeClass[r.resultLevel]}`}>{r.resultLevel}</span>
                  </td>
                  <td>{r.decision ? <span className="badge badge-neutral">{r.decision}</span> : '—'}</td>
                  <td>{new Date(r.createdAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-secondary">
            Page {data.page} of {data.totalPages}
          </span>
          <div className="flex gap-2">
            <PageLink sp={sp} page={data.page - 1} disabled={data.page <= 1} label="Previous" />
            <PageLink sp={sp} page={data.page + 1} disabled={data.page >= data.totalPages} label="Next" />
          </div>
        </div>
      )}
    </>
  );
}

function PageLink({ sp, page, disabled, label }: { sp: SP; page: number; disabled: boolean; label: string }) {
  if (disabled) {
    return (
      <span className="btn btn-secondary btn-sm" style={{ opacity: 0.5, pointerEvents: 'none' }}>
        {label}
      </span>
    );
  }
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val && k !== 'page') params.set(k, val);
  }
  params.set('page', String(page));
  return (
    <a className="btn btn-secondary btn-sm" href={`/history?${params.toString()}`}>
      {label}
    </a>
  );
}
