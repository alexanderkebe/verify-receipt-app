// GET /api/verify/health — proxy the Verifier API health check
import { checkApiHealth } from '@/lib/verifier-api';
import { ok, handleError, requireSession } from '@/lib/api-helpers';
import { isDemoMode } from '@/lib/demo-data';
import { hasLiveVerifier } from '@/lib/demo-verification';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (isDemoMode()) {
    // With an API key configured, report the real Verifier API health
    if (hasLiveVerifier()) return ok(await checkApiHealth());
    return ok({ healthy: true, responseTime: 142 });
  }
  try {
    await requireSession();
    const health = await checkApiHealth();
    return ok(health);
  } catch (error) {
    return handleError(error);
  }
}
