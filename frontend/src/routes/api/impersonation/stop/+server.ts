import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { stopImpersonation } from '$lib/server/auth/impersonate';

// Ends an admin impersonation and puts the admin's own session back. Lives
// under `/api` so the impersonated session, a talent's or a dev's, reaches it:
// under `/staff/admin/*` the route guards would bounce it. The session itself
// is the authorization: only one that carries `impersonatedBy` has a way back.
export const POST: RequestHandler = async ({ request, cookies, locals }) => {
  const adminUserId = (
    locals.session as { impersonatedBy?: string | null } | null
  )?.impersonatedBy;
  if (!adminUserId) error(403, "Aucune session d'impersonation en cours.");

  if (!(await stopImpersonation(request, cookies, adminUserId))) {
    error(500, 'Impossible de revenir au compte admin.');
  }
  return new Response(null, { status: 204 });
};
