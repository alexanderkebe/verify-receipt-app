// GET /api/dashboard/stats
import { getDashboardStats } from '@/lib/dashboard';
import { requireBusiness, ok, handleError } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = await requireBusiness();
    const stats = await getDashboardStats(ctx.businessId);
    return ok(stats);
  } catch (error) {
    return handleError(error);
  }
}
