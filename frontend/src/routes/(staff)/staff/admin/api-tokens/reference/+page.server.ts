/**
 * The HTTP reference, rendered for a person rather than for an HTTP client.
 *
 * It is the document `GET /api/admin/openapi.json` serves, built by the same
 * function, so the page and the JSON cannot describe two different APIs.
 *
 * It describes every core operation, each saying which kind of token it
 * needs when only one is offered it, rather than the session reading it, and
 * that leaks nothing: the admin reading this page can mint either token on the
 * page next door. Narrowing it to what a session may call would hide every
 * write, which is precisely what somebody comes here to look up before minting
 * a token, and documenting a token allowed to write would hide the verbatim
 * reads it is never served.
 *
 * Reading it is not an API call, so nothing lands in `AdminApi_Call`.
 *
 * The page skips the admin layout (`+page@(staff).svelte`), and with it the
 * layout's own admin check, so the gate is restated here rather than left to
 * the path rule in `applyRouteGuards` alone.
 */
import type { PageServerLoad } from './$types';
import { requireAdminSession } from '$lib/server/auth/guards';
import { buildOpenApiDocument } from '$lib/server/adminApi/openapi';

export const load: PageServerLoad = async ({ locals, url }) => {
  requireAdminSession(locals);
  return {
    document: await buildOpenApiDocument({
      tier: 'core',
      writeEnabled: 'either',
      origin: url.origin,
    }),
  };
};
