// GET /api/dashboard/stats
import { getDashboardStats } from '@/lib/dashboard';
import { requireBusiness, ok, handleError } from '@/lib/api-helpers';
import { isDemoMode, demoDashboardStats } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (isDemoMode()) return ok(demoDashboardStats);
  try {
    const ctx = await requireBusiness();
    const stats = await getDashboardStats(ctx.businessId);
    return ok(stats);
  } catch (error) {
    return handleError(error);
  }
}
