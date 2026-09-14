import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { safeTokenEquals } from './safeTokenCompare';

/**
 * The one bearer check in front of `/api/worker/*`.
 *
 * It was copied into each route file, which was tolerable at three and is not
 * at six: a seventh route added by copying the block is a route whose auth
 * nobody reviewed, and the failure mode of getting it subtly wrong is an open
 * endpoint that writes talents.
 *
 * Unset `WORKER_API_TOKEN` refuses everything rather than letting anything
 * through, which is what keeps an environment that never configured the worker
 * from being writable by anybody who finds the path.
 *
 * Worth knowing about this namespace: it sits outside the `/api/admin` and
 * `/api/mcp` prefixes that the curated admin API assumes are rate-limited at
 * the edge. There is no per-call audit row here either. What stands in for both
 * is that the credential is machine-only, the surface is six fixed operations,
 * and every real run leaves a `Sync_Run`.
 */
export function requireWorkerToken(request: Request): void {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (
    !env.WORKER_API_TOKEN ||
    !token ||
    !safeTokenEquals(token, env.WORKER_API_TOKEN)
  )
    throw error(401, 'Unauthorized: Invalid or missing token');
}
