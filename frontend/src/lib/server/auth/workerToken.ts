import { WORKER_API_TOKEN } from '$app/env/private';
import { requireBearerSecret } from './bearerSecret';

/**
 * The one bearer check in front of `/api/worker/*`.
 *
 * It was copied into each route file, which was tolerable at three and is not
 * at six: a seventh route added by copying the block is a route whose auth
 * nobody reviewed, and the failure mode of getting it subtly wrong is an open
 * endpoint that writes talents.
 *
 * The comparison itself is `requireBearerSecret`'s, shared with the cron jobs:
 * an unset `WORKER_API_TOKEN` refuses everything, which is what keeps an
 * environment that never configured the worker from being writable by anybody
 * who finds the path.
 *
 * Worth knowing about this namespace: it sits outside the `/api/admin` and
 * `/api/mcp` prefixes, so no rate control scoped to the curated admin API would
 * cover it (what is in place there is stated once, in
 * `.claude/rules/admin-api.md`). There is no per-call audit row here either. What stands in for both
 * is that the credential is machine-only, the surface is six fixed operations,
 * and every real run leaves a `Sync_Run`.
 */
export function requireWorkerToken(request: Request): void {
  requireBearerSecret(request, WORKER_API_TOKEN);
}
