import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { getStaffRoleRedirectPath } from '$lib/domain/staff';
import { captureRedirectCookie } from '$lib/server/auth/loginRedirect';

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
  if (locals.user && locals.staffProfile?.staffRole) {
    const targetPath = getStaffRoleRedirectPath(locals.staffProfile.staffRole);
    if (targetPath) {
      throw redirect(302, resolve(targetPath));
    }
  }

  // Stash where the guard bounced them from, to replay after OAuth succeeds.
  captureRedirectCookie(url, cookies);

  const errorType = url.searchParams.get('error');
  let errorMessage = '';

  if (errorType === 'UnauthorizedDomain') {
    errorMessage = 'Accès refusé. Veuillez utiliser une adresse @epitech.eu.';
  } else if (errorType === 'OAuthFailed') {
    errorMessage = "Échec de l'authentification Microsoft.";
  } else if (errorType === 'OAuthStateMismatch') {
    errorMessage = 'Erreur de sécurité (State Mismatch). Veuillez réessayer.';
  } else if (errorType === 'ProviderMissing') {
    errorMessage =
      "Le fournisseur d'authentification Microsoft n'est pas configuré.";
  } else if (errorType === 'NoRole') {
    errorMessage =
      "Aucun rôle n'a été attribué à votre compte. Contactez un administrateur.";
  } else if (errorType === 'NotInvited') {
    errorMessage =
      "Votre adresse n'est pas autorisée. Contactez un responsable pour obtenir un accès.";
  }

  return {
    errorMessage,
  };
};
