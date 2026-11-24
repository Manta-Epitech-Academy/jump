import { timingSafeEqual } from 'node:crypto';
import { error } from '@sveltejs/kit';

/**
 * The one check behind every machine credential Jump holds as an env var:
 * `CRON_SECRET` (`/api/jobs/*`, through `cronJob`), `WORKER_API_TOKEN`
 * (`/api/worker/*`, through `requireWorkerToken`) and `LOAD_TEST_SECRET`
 * (`/api/test/*`, through `assertLoadTestAuth`).
 *
 * The contract, stated here and nowhere else:
 *   - An unset or empty secret refuses every call. An environment that never
 *     configured a credential is closed, not open to whoever finds the path.
 *   - The token is the `Authorization` header with its `Bearer ` prefix
 *     removed, compared in constant time so the check is no timing oracle that
 *     recovers the secret byte by byte. The length may leak, which is standard
 *     for this primitive: the secret is a fixed-length random token.
 *
 * It used to be copied into each route, and a copy is where a defect lives on:
 * until 27/05/2026 every copy compared with `!==`, and the OWASP audit had to
 * find and fix each file by hand.
 */
export function bearerMatches(
  request: Request,
  secret: string | undefined,
): boolean {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!secret || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** {@link bearerMatches}, or a 401 a machine caller reads in its own log. */
export function requireBearerSecret(
  request: Request,
  secret: string | undefined,
): void {
  if (!bearerMatches(request, secret))
    throw error(401, 'Unauthorized: Invalid or missing token');
}
