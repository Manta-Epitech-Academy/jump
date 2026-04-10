import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { m } from '$lib/paraglide/messages.js';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (locals.user && (locals.user.role === 'staff' || locals.user.role === 'admin')) {
    throw redirect(302, resolve('/'));
  }

  const errorType = url.searchParams.get('error');
  let errorMessage = '';

  if (errorType === 'UnauthorizedDomain') {
    errorMessage = m.auth_error_unauthorized_domain();
  } else if (errorType === 'OAuthFailed') {
    errorMessage = m.auth_error_oauth_failed();
  } else if (errorType === 'OAuthStateMismatch') {
    errorMessage = m.auth_error_state_mismatch();
  } else if (errorType === 'ProviderMissing') {
    errorMessage = m.auth_error_provider_missing();
  }

  return {
    errorMessage,
  };
};
