/**
 * Authentication and authorisation for the curated admin API: a nominative
 * bearer token, or an admin browser session.
 *
 * Two steps, because the two consumers need them at different moments.
 * `authenticateOrRefuse` answers "who is this", refusing and recording the call
 * otherwise, and every transport runs it once per request before anything else
 * (over MCP, before the protocol layer sees anything). `authorizeOperation` answers
 * "may they run this, right now" and runs per call: over HTTP that is the same
 * request, over MCP it is every tool invocation, because what a tier may reach
 * is a property of the operation and not of the connection.
 *
 * Every refusal this tier can produce lives in this file, on purpose. The rules
 * are cross-cutting (tier, then capability) and there are two consumers;
 * spread them out and the surfaces drift, which is precisely how something ends
 * up reachable over HTTP while looking forbidden over MCP.
 *
 * Both credential paths reach the same reads. The token is what the MCP server
 * and scripts use; the session means any future admin page can call these
 * endpoints without a second implementation, and (unlike the route guards in
 * `applyRouteGuards`, which skip `/api/*`) the check lives here, in the request.
 *
 * Writes are token-only. Not a limitation, a design choice: a mutation should be
 * attributable to a named credential somebody deliberately minted for it, and
 * confining writes to bearer tokens also means a cookie-carrying cross-origin
 * POST is not a threat model this endpoint has to reason about. An admin with a
 * browser still has the admin UI.
 */

import { json, type RequestEvent } from '@sveltejs/kit';
import { verifyToken } from './tokens';
import {
  ANONYMOUS_ACTOR,
  recordAdminApiCall,
  type AdminApiCaller,
} from './audit';
import {
  isOperationAllowedForCapability,
  isOperationAllowedForTier,
  type AdminApiOperation,
} from './operations';

/**
 * An identified caller and what their credential is allowed to do. Carried
 * around rather than re-read, so one request hits the token row once.
 */
export type AdminApiCredential = {
  caller: AdminApiCaller;
  /** False for every session caller: writes are token-only. */
  writeEnabled: boolean;
};

export type AdminApiRefusal = {
  ok: false;
  status: 401 | 403;
  message: string;
};

export type AdminApiAuth =
  | ({ ok: true } & AdminApiCredential)
  | (AdminApiRefusal & { caller: AdminApiCaller });

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const value = header.slice('Bearer '.length).trim();
  return value || null;
}

/**
 * Authenticate the request, or answer its refusal: the preamble every transport
 * of this tier opens with (the HTTP routes, the MCP endpoint, the OpenAPI
 * document). Written once because each copy had to remember the refusal's audit
 * row, and a refused call is exactly the kind that shows somebody probing. What
 * only a transport can judge (malformed params, an oversized envelope, a batch)
 * stays with that transport.
 */
export async function authenticateOrRefuse(
  event: Pick<RequestEvent, 'request' | 'locals'>,
  operation: string,
): Promise<AdminApiCredential | Response> {
  const auth = await authenticateAdminApi(event);
  if (auth.ok) return { caller: auth.caller, writeEnabled: auth.writeEnabled };
  await recordAdminApiCall({
    caller: auth.caller,
    operation,
    status: auth.status,
  });
  return json({ error: auth.message }, { status: auth.status });
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
    tier: 'core',
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
    return {
      ok: true,
      caller: {
        actorUserId: verified.staffUserId,
        tokenId: verified.tokenId,
        tier: verified.tier,
      },
      writeEnabled: verified.writeEnabled,
    };
  }

  if (event.locals.staffProfile?.staffRole === 'admin') {
    const actorUserId = event.locals.user?.id;
    if (actorUserId) {
      return {
        ok: true,
        caller: { actorUserId, tokenId: null, tier: 'core' },
        writeEnabled: false,
      };
    }
  }

  return {
    ok: false,
    status: 403,
    message: 'Accès réservé aux administrateurs.',
    caller: anonymous,
  };
}

/**
 * May this credential run this operation now? Tier, then capability, in that
 * order: an operation a tier cannot reach must read as "not for you" rather
 * than as a capability problem.
 *
 * It asks the database nothing, and that is worth stating because it used to.
 * Two per-token ceilings hung here, counted live off `AdminApi_Call`; issue #355
 * removed them. What bounds a token now is what it was minted with, and none of
 * that needs a query: `verifyToken` already re-read the owner's admin role.
 */
export function authorizeOperation(
  credential: AdminApiCredential,
  operation: AdminApiOperation,
): { ok: true } | AdminApiRefusal {
  const { caller, writeEnabled } = credential;

  if (!isOperationAllowedForTier(operation, caller.tier)) {
    return {
      ok: false,
      status: 403,
      message:
        "Ce token donne accès aux chiffres de pilotage uniquement. L'opération demandée n'en fait pas partie.",
    };
  }

  if (!isOperationAllowedForCapability(operation, writeEnabled)) {
    if (operation.kind === 'read') {
      return {
        ok: false,
        status: 403,
        message:
          "Cette opération rend mot pour mot un texte qu'un administrateur n'a pas écrit, comme les phrases des élèves. Elle n'est pas servie à un token qui peut modifier, pour qu'aucun texte cité ne puisse provoquer une modification : utilisez un token en lecture seule ou un token de pilotage.",
      };
    }
    return {
      ok: false,
      status: 403,
      message: caller.tokenId
        ? "Ce token est en lecture seule. Les modifications demandent un token créé avec l'autorisation de modifier ; cela ne peut pas être ajouté après coup."
        : "Les modifications passent par un token créé pour cela, jamais par une session ouverte dans le navigateur : c'est ce qui rend chaque modification attribuable.",
    };
  }

  return { ok: true };
}
