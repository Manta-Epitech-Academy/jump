import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { startImpersonation } from '$lib/server/auth/impersonate';

// Admin impersonation endpoint, shared by the talents directory and the users
// page. Lives under /staff/admin/* so the route guard already gates it to admins;
// the explicit check below is belt-and-braces (BetterAuth re-checks the actor's
// role when minting the session). Returns the redirect target so the caller does
// a full-page navigation, letting the new session cookie be read fresh.
export const POST: RequestHandler = async ({ request, cookies, locals }) => {
  if (locals.staffProfile?.staffRole !== 'admin' || !locals.user) {
    error(403, 'Réservé aux administrateurs.');
  }

  const body = (await request.json().catch(() => null)) as {
    kind?: unknown;
    id?: unknown;
  } | null;
  const kind = body?.kind;
  const id = body?.id;
  if (
    (kind !== 'talent' && kind !== 'staff') ||
    typeof id !== 'string' ||
    !id
  ) {
    error(400, 'Requête invalide.');
  }

  const result = await startImpersonation(
    { kind, id },
    request,
    cookies,
    locals.user.id,
  );
  if (!result.ok) {
    error(
      result.reason === 'no_email' ? 400 : 500,
      result.reason === 'no_email'
        ? "Ce talent n'a pas d'email — impossible de créer un compte de connexion."
        : 'Impersonation refusée.',
    );
  }

  return json({ redirect: result.redirect });
};
