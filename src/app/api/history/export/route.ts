// GET /api/history/export — CSV export of verification history
import { NextRequest } from 'next/server';
import { getHistory } from '@/lib/history';
import { requireBusiness, handleError } from '@/lib/api-helpers';
import { EXPORT_MAX_ROWS } from '@/lib/constants';
import { PROVIDER_LABELS } from '@/types';
import type { Provider, ResultLevel } from '@/types';
import { isDemoMode, demoHistory } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

function csvCell(value: string | number | null): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  if (isDemoMode()) {
    const header = ['Date','Reference','Provider','Payer','Employee','Verified Amount','Expected Amount','Result','Decision'];
    const rows = demoHistory.items.map((r: Record<string, unknown>) =>
      [r.createdAt, r.referenceMasked, r.provider, r.payerName, r.employeeName, r.verifiedAmount, r.expectedAmount, r.resultLevel, r.employeeDecision].map((v) => csvCell(v as string | number | null)).join(',')
    );
    const csv = [`# Demo export — ${demoHistory.total} records`, header.join(','), ...rows].join('\n');
    return new Response(csv, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="demo-history.csv"' } });
  }
  try {
    const ctx = await requireBusiness();
    const sp = req.nextUrl.searchParams;

    // Export up to 5000 rows matching the current filters
    const data = await getHistory(
      { businessId: ctx.businessId, role: ctx.role, userId: ctx.userId },
      {
        provider: (sp.get('provider') as Provider) || undefined,
        resultLevel: (sp.get('resultLevel') as ResultLevel) || undefined,
        reference: sp.get('reference') || undefined,
        dateFrom: sp.get('dateFrom') || undefined,
        dateTo: sp.get('dateTo') || undefined,
        page: 1,
        pageSize: EXPORT_MAX_ROWS,
      },
      EXPORT_MAX_ROWS,
    );

    const header = [
      'Date',
      'Reference',
      'Provider',
      'Payer',
      'Employee',
      'Verified Amount',
      'Expected Amount',
      'Result',
      'Recipient Match',
      'Amount Match',
      'Duplicate',
      'Decision',
    ];

    const rows = data.items.map((r) =>
      [
        new Date(r.createdAt).toISOString(),
        r.referenceMasked,
        PROVIDER_LABELS[r.provider],
        r.payerName,
        r.employeeName,
        r.verifiedAmount,
        r.expectedAmount,
        r.resultLevel,
        r.recipientMatches === null ? '' : r.recipientMatches ? 'Yes' : 'No',
        r.amountMatches === null ? '' : r.amountMatches ? 'Yes' : 'No',
        r.isDuplicate ? 'Yes' : 'No',
        r.decision ?? '',
      ]
        .map(csvCell)
        .join(','),
    );

    const generatedAt = new Date().toISOString();
    const csv = [`# Generated ${generatedAt} — ${data.total} records`, header.join(','), ...rows].join('\n');

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="verification-history-${generatedAt.slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
