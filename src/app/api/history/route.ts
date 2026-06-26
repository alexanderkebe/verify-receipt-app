// GET /api/history — paginated, filtered verification records
import { NextRequest } from 'next/server';
import { getHistory } from '@/lib/history';
import { requireBusiness, ok, handleError } from '@/lib/api-helpers';
import type { HistoryFilters, Provider, ResultLevel, EmployeeDecision } from '@/types';
import { isDemoMode, demoHistory } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (isDemoMode()) return ok(demoHistory);
  try {
    const ctx = await requireBusiness();
    const sp = req.nextUrl.searchParams;
    const filters: HistoryFilters = {
      dateFrom: sp.get('dateFrom') || undefined,
      dateTo: sp.get('dateTo') || undefined,
      provider: (sp.get('provider') as Provider) || undefined,
      resultLevel: (sp.get('resultLevel') as ResultLevel) || undefined,
      employeeId: sp.get('employeeId') || undefined,
      reference: sp.get('reference') || undefined,
      decision: (sp.get('decision') as EmployeeDecision) || undefined,
      minAmount: sp.get('minAmount') ? Number(sp.get('minAmount')) : undefined,
      maxAmount: sp.get('maxAmount') ? Number(sp.get('maxAmount')) : undefined,
      page: sp.get('page') ? Number(sp.get('page')) : 1,
      pageSize: sp.get('pageSize') ? Number(sp.get('pageSize')) : undefined,
    };

    const result = await getHistory({ businessId: ctx.businessId, role: ctx.role, userId: ctx.userId }, filters);
    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
