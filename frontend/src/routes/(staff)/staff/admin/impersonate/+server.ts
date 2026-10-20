import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  startImpersonation,
  type ImpersonationRefusal,
} from '$lib/server/auth/impersonate';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

// Admin impersonation endpoint, shared by the talents directory and the users
// page. Lives under /staff/admin/* so the route guard already gates it to admins;
// the explicit check below is belt-and-braces (BetterAuth re-checks the actor's
// role when minting the session). Returns the redirect target so the caller does
// a full-page navigation, letting the new session cookie be read fresh.
/** What the admin is told, per refusal. */
const REFUSALS: Record<
  ImpersonationRefusal,
  { status: number; message: string }
> = {
  no_email: {
    status: 400,
    message:
      "Ce talent n'a pas d'adresse email Salesforce : impossible de créer son compte de connexion.",
  },
  identity_conflict: {
    status: 409,
    message:
      "L'adresse email de ce talent est déjà celle d'un autre compte (parent, staff ou autre talent) : corrigez-la dans Salesforce. Le conflit figure dans Erreurs de Sync.",
  },
  failed: { status: 500, message: 'Impersonation refusée.' },
};

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
  if (locals.staffProfile?.staffRole !== 'admin' || !locals.user) {
    error(403, 'Réservé aux administrateurs.');
  }

  const body = (await request.json().catch(() => null)) as {
    kind?: unknown;
    id?: unknown;
    reason?: unknown;
  } | null;
  const kind = body?.kind;
  const id = body?.id;
  // "Explorer un campus" and impersonating one named person post the same
  // `{kind, id}` here, so without this they are indistinguishable and the two
  // read as one feature. Optional and defaulting to `person`: an older client,
  // or any caller that does not care, still works.
  const reason =
    body?.reason === 'campus_exploration' ? 'campus_exploration' : 'person';
  if (
    (kind !== 'talent' && kind !== 'staff') ||
    typeof id !== 'string' ||
    !id
  ) {
    error(400, 'Requête invalide.');
  }

  // A failure of ours is logged and answered in French, like the refusals:
  // left to SvelteKit it would reach the admin's toast as "Internal Error".
  const result = await startImpersonation(
    { kind, id },
    request,
    cookies,
    locals.user.id,
  ).catch((err: unknown) => {
    console.error('[impersonate] failed:', err);
    return { ok: false as const, reason: 'failed' as const };
  });
  if (!result.ok) {
    const refusal = REFUSALS[result.reason];
    error(refusal.status, refusal.message);
  }

  recordUsage(
    reason === 'campus_exploration'
      ? USAGE_FEATURES.ADMIN_EXPLORE_CAMPUS
      : USAGE_FEATURES.ADMIN_IMPERSONATE_PERSON,
    { locals },
  );

  return json({ redirect: result.redirect });
};
