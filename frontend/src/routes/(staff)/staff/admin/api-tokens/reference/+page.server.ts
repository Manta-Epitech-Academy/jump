/**
 * The HTTP reference, rendered for a person rather than for an HTTP client.
 *
 * It is the document `GET /api/admin/openapi.json` serves, built by the same
 * function, so the page and the JSON cannot describe two different APIs.
 *
 * It describes the widest credential (a core token allowed to write) rather
 * than the session reading it, and that leaks nothing: the admin reading this
 * page can mint that token on the page next door. Narrowing it to what a
 * session may call would hide every write, which is precisely what somebody
 * comes here to look up before minting a token.
 *
 * Reading it is not an API call, so nothing lands in `AdminApi_Call`.
 */
import type { PageServerLoad } from './$types';
import { buildOpenApiDocument } from '$lib/server/adminApi/openapi';

export const load: PageServerLoad = async ({ url }) => ({
  document: await buildOpenApiDocument({
    tier: 'core',
    writeEnabled: true,
    origin: url.origin,
  }),
});
