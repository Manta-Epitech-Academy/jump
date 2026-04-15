import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (
    locals.user &&
    (locals.user.role === 'staff' || locals.user.role === 'admin')
  ) {
    throw redirect(302, resolve('/staff/dev'));
  }

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
  }

  return {
    errorMessage,
  };
};
