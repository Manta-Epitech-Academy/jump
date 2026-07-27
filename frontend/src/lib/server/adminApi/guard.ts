/**
 * Authentication for the curated admin API: a nominative bearer token, or an
 * admin browser session.
 *
 * Both paths reach the same operations on purpose. The token is what the MCP
 * server and scripts use; the session means any future admin page can call these
 * endpoints without a second implementation, and (unlike the route guards in
 * `applyRouteGuards`, which skip `/api/*`) the check lives here, in the request.
 */

import type { RequestEvent } from '@sveltejs/kit';
import { verifyToken, countRecentCalls, DAILY_CALL_QUOTA } from './tokens';
import { ANONYMOUS_ACTOR, type AdminApiCaller } from './audit';

export type AdminApiAuth =
  | { ok: true; caller: AdminApiCaller }
  | {
      ok: false;
      status: 401 | 403 | 429;
      message: string;
      caller: AdminApiCaller;
    };

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const value = header.slice('Bearer '.length).trim();
  return value || null;
}

/**
 * Resolve the caller. Never throws: the wrapper needs the outcome (and its
 * status) so a refusal is logged like anything else.
 *
 * Order matters. A request carrying a bearer is a machine call and is judged as
 * one, even if it also happens to carry admin cookies: otherwise a revoked token
 * would silently keep working from a browser that still holds a session.
 */
export async function authenticateAdminApi(
  event: Pick<RequestEvent, 'request' | 'locals'>,
): Promise<AdminApiAuth> {
  const anonymous: AdminApiCaller = {
    actorUserId: ANONYMOUS_ACTOR,
    tokenId: null,
  };
  const secret = bearer(event.request);

  if (secret) {
    const verified = await verifyToken(secret);
    if (!verified) {
      // Unknown and revoked are one answer, so a caller can't probe which.
      return {
        ok: false,
        status: 401,
        message: 'Token invalide ou révoqué.',
        caller: anonymous,
      };
    }

    const caller: AdminApiCaller = {
      actorUserId: verified.staffUserId,
      tokenId: verified.tokenId,
    };

    // Quota applies to tokens only: a human clicking a page is not the runaway
    // loop this protects against, and locking an admin out of their own screens
    // would be a worse failure than the one being prevented.
    if ((await countRecentCalls(verified.tokenId)) >= DAILY_CALL_QUOTA) {
      return {
        ok: false,
        status: 429,
        message: `Quota atteint (${DAILY_CALL_QUOTA} appels sur 24 h). Réessayez plus tard.`,
        caller,
      };
    }

    return { ok: true, caller };
  }

  if (event.locals.staffProfile?.staffRole === 'admin') {
    const actorUserId = event.locals.user?.id;
    if (actorUserId) {
      return { ok: true, caller: { actorUserId, tokenId: null } };
    }
  }

  return {
    ok: false,
    status: 403,
    message: 'Accès réservé aux administrateurs.',
    caller: anonymous,
  };
}
