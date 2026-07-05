'use client';

import type { VerificationResult } from '@/types';
import { PROVIDER_LABELS } from '@/types';

const ICONS: Record<string, string> = { GREEN: '✓', RED: '✕', YELLOW: '!' };
const TITLES: Record<string, string> = {
  GREEN: 'Payment Verified',
  RED: 'Issue Detected',
  YELLOW: 'Unable to Verify',
};

function money(v: number | null, currency: string) {
  if (v === null || v === undefined) return '—';
  return `${v.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${currency}`;
}

export default function ResultCard({ result }: { result: VerificationResult }) {
  const level = result.resultLevel;
  return (
    <div className={`result-card result-card-${level.toLowerCase()} animate-scaleIn`}>
      <div className="result-icon">{ICONS[level]}</div>
      <h3 className="result-title">{TITLES[level]}</h3>
      <p className="result-description">{result.resultReason}</p>

      <div className="card card-padding mt-6" style={{ textAlign: 'left' }}>
        <div className="grid-2" style={{ gap: 'var(--space-3)' }}>
          <Detail label="Provider" value={PROVIDER_LABELS[result.provider]} />
          <Detail label="Reference" value={result.referenceMasked} />
          <Detail label="Payer" value={result.payerName ?? '—'} />
          <Detail label="Recipient" value={result.recipientName ?? '—'} />
          <Detail label="Recipient account" value={result.recipientAccountMasked ?? '—'} />
          <Detail
            label="Transaction date"
            value={result.transactionDate ? new Date(result.transactionDate).toLocaleString() : '—'}
          />
          <Detail label="Verified amount" value={money(result.verifiedAmount, result.currency)} />
          <Detail label="Expected amount" value={money(result.expectedAmount, result.currency)} />
          {result.fees != null && <Detail label="Service fee" value={money(result.fees, result.currency)} />}
          {result.receiptNumber && <Detail label="Receipt number" value={result.receiptNumber} />}
          <Detail label="Transaction status" value={result.transactionStatus ?? '—'} />
          <Detail
            label="Recipient match"
            value={result.recipientMatches === null ? '—' : result.recipientMatches ? 'Yes' : 'No'}
          />
          <Detail
            label="Amount match"
            value={result.amountMatches === null ? '—' : result.amountMatches ? 'Yes' : 'No'}
          />
        </div>

        {result.apiDescription && result.resultLevel !== 'YELLOW' && (
          <div className="text-sm text-secondary mt-4" style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-3)' }}>
            {result.apiDescription}
          </div>
        )}

        {result.isDuplicate && result.duplicateInfo && (
          <div className="alert alert-danger mt-4">
            Duplicate of a receipt accepted on{' '}
            {new Date(result.duplicateInfo.previousDate).toLocaleString()} by{' '}
            {result.duplicateInfo.previousEmployee}.
          </div>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div className="text-sm font-medium text-primary">{value}</div>
    </div>
  );
}
