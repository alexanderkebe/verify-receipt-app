// GET /api/verify/health — proxy the Verifier API health check
import { checkApiHealth } from '@/lib/verifier-api';
import { ok, handleError, requireSession } from '@/lib/api-helpers';
import { isDemoMode } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (isDemoMode()) return ok({ healthy: true, responseTime: 142 });
  try {
    await requireSession();
    const health = await checkApiHealth();
    return ok(health);
  } catch (error) {
    return handleError(error);
  }
}
