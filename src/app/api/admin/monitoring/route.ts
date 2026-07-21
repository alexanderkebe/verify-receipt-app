// GET /api/admin/monitoring — platform health & volume
import prisma from '@/lib/prisma';
import { getCachedApiHealth } from '@/lib/verifier-api';
import { requireRole, ok, handleError } from '@/lib/api-helpers';
import { isDemoMode, demoAdminMonitoring } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (isDemoMode()) return ok(demoAdminMonitoring);
  try {
    await requireRole('PLATFORM_ADMIN');
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [health, businesses, activeBusinesses, totalVerifications, last24h, failures24h] = await Promise.all([
      getCachedApiHealth(),
      prisma.business.count(),
      prisma.business.count({ where: { status: 'ACTIVE' } }),
      prisma.receiptVerification.count(),
      prisma.receiptVerification.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.receiptVerification.count({
        where: { createdAt: { gte: dayAgo }, verificationStatus: { in: ['ERROR', 'TIMEOUT'] } },
      }),
    ]);

    const errorRate = last24h > 0 ? Math.round((failures24h / last24h) * 100) : 0;

    return ok({
      apiHealthy: health.healthy,
      apiResponseMs: health.responseTime,
      businesses,
      activeBusinesses,
      totalVerifications,
      last24h,
      failures24h,
      errorRate,
    });
  } catch (error) {
    return handleError(error);
  }
}
