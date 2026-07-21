// GET /api/me/stats — the signed-in employee's day-to-day progress
import { getCachedMeStats } from '@/lib/me-stats';
import { requireBusiness, ok, handleError } from '@/lib/api-helpers';
import { isDemoMode } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

const DEMO_STATS = {
  today: { total: 23, verified: 19, issues: 3, rejected: 1, valueVerified: 41200 },
  yesterday: { total: 31, verified: 27 },
  trend: Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000);
    return { date: d.toISOString().slice(0, 10), total: 10 + i * 3, verified: 8 + i * 3, failed: 1 };
  }),
  decisions: { accepted: 18, rejected: 2, escalated: 1 },
};

export async function GET() {
  if (isDemoMode()) return ok(DEMO_STATS);
  try {
    const ctx = await requireBusiness();
    const stats = await getCachedMeStats(ctx.businessId, ctx.userId);
    return ok(stats);
  } catch (error) {
    return handleError(error);
  }
}
