// GET /api/verify/health — proxy the Verifier API health check
import { checkApiHealth } from '@/lib/verifier-api';
import { ok, handleError, requireSession } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireSession();
    const health = await checkApiHealth();
    return ok(health);
  } catch (error) {
    return handleError(error);
  }
}
