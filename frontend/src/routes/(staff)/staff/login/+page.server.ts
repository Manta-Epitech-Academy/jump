import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { getStaffRoleRedirectPath } from '$lib/domain/staff';
import { captureRedirectCookie } from '$lib/server/auth/loginRedirect';

// Two refusals, one situation: the address is already somebody's talent or
// guardian login. BetterAuth says so for a row that has never signed in, the
// staff door for one that has.
const OTHER_ACCOUNT_TYPE =
  "Cette adresse est déjà rattachée à un compte d'un autre type (élève ou responsable légal). Contactez un administrateur.";

// A failed sign-in lands back here carrying an `error` code, and the codes come
// from two vocabularies. Jump's own are set by the staff door
// (`auth/staffDoor.ts`), by `staff/oauth/callback` and by `guards.ts`.
// BetterAuth's are snake_case. Both reach this page from inside BetterAuth's
// callback because `server/auth.ts` names it as `onAPIError.errorURL`: without
// that, a refusal there (the staff door's, `account_not_linked`,
// `state_not_found`, `invalid_code`) redirects to `/api/auth/error`, an English
// page nobody here wrote.
//
// Only a code that changes what the person does next earns a line of its own;
// the rest share the fallback. The fallback is the load-bearing half: an
// unrecognised code used to resolve to an empty string, so a failed sign-in
// re-rendered the login form with no explanation at all, which is how
// `account_not_linked` reached a member of staff as silence rather than as a
// message. `OAuthFailed`, `OAuthStateMismatch` and `ProviderMissing` are gone
// for that same reason read forwards: the first said no more than the fallback
// does, and nothing in the codebase has ever emitted the other two.
const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  UnauthorizedDomain:
    'Accès refusé. Veuillez utiliser une adresse @epitech.eu.',
  NotInvited:
    "Votre adresse n'est pas autorisée. Contactez un responsable pour obtenir un accès.",
  NoRole:
    "Aucun rôle n'a été attribué à votre compte. Contactez un administrateur.",
  NotStaffAccount: OTHER_ACCOUNT_TYPE,
  account_not_linked: OTHER_ACCOUNT_TYPE,
};

const LOGIN_ERROR_FALLBACK =
  'La connexion Microsoft a échoué. Réessayez, et contactez un administrateur si le problème persiste.';

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
  if (locals.user && locals.staffProfile?.staffRole) {
    const targetPath = getStaffRoleRedirectPath(locals.staffProfile.staffRole);
    if (targetPath) {
      throw redirect(302, resolve(targetPath));
    }
  }

  // Stash where the guard bounced them from, to replay after OAuth succeeds.
  captureRedirectCookie(url, cookies, 'staff');

  const errorType = url.searchParams.get('error');
  const errorMessage = errorType
    ? (LOGIN_ERROR_MESSAGES[errorType] ?? LOGIN_ERROR_FALLBACK)
    : '';

  return {
    errorMessage,
  };
};
