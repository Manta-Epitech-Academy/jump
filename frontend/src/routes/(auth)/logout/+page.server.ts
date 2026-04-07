import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { resolve } from '$app/paths';
import { auth } from '$lib/server/auth';
import { forwardAuthCookies } from '$lib/server/auth/cookies';

export const actions: Actions = {
  default: async ({ request, url, cookies }) => {
    const type = url.searchParams.get('type');

    try {
      // Sign out via BetterAuth and get the response to propagate cleared cookies
      const authResponse = await auth.api.signOut({
        headers: request.headers,
        asResponse: true,
      });

      if (authResponse.ok) {
        forwardAuthCookies(authResponse, cookies);
      }
    } catch (err) {
      console.error('[logout] Error during signOut:', err);
    }

    // Fallback: forcefully delete cookies just in case
    cookies.delete('better-auth.session_token', { path: '/' });
    cookies.delete('better-auth.session_data', { path: '/' });

    if (type === 'admin') {
      throw redirect(303, resolve('/admin/login'));
    } else if (type === 'student') {
      throw redirect(303, resolve('/camper/login'));
    } else {
      throw redirect(303, resolve('/login'));
    }
  },
};
