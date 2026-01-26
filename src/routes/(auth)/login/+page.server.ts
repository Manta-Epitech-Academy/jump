import type { Actions, PageServerLoad } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { loginSchema } from '$lib/validation/auth';
import { dev } from '$app/environment';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.pb.authStore.isValid) {
		throw redirect(302, '/');
	}

	const form = await superValidate(zod4(loginSchema));

	// Handle errors returned from the OAuth callback
	const errorType = url.searchParams.get('error');
	let errorMessage = '';

	if (errorType === 'UnauthorizedDomain') {
		errorMessage = 'Accès refusé. Veuillez utiliser une adresse @epitech.eu.';
	} else if (errorType === 'OAuthFailed') {
		errorMessage = "Échec de l'authentification Microsoft.";
	}

	return {
		form,
		errorMessage
	};
};

export const actions: Actions = {
	login: async ({ request, locals }) => {
		const form = await superValidate(request, zod4(loginSchema));
		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			await locals.pb.collection('users').authWithPassword(form.data.identity, form.data.password);

			return message(form, 'Connexion réussie, redirection…');
		} catch (err: unknown) {
			return message(form, 'Identifiants invalides', { status: 400 });
		}
	},

	oauth2: async ({ cookies, locals, url }) => {
		let authUrl = '';

		try {
			const authMethods = await locals.pb.collection('users').listAuthMethods({
				requestKey: null
			});

			if (!authMethods) {
				return fail(500, { message: 'Auth methods unavailable' });
			}

			const providers = authMethods.oauth2?.providers || [];

			const provider = providers.find((p) => p.name === 'microsoft');

			if (!provider) {
				return fail(400, { message: 'Microsoft login not configured' });
			}

			const isSecure = !dev;

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const cookieOptions: any = {
				path: '/',
				httpOnly: true,
				maxAge: 60 * 10 // 10 minutes
			};

			if (isSecure) {
				cookieOptions.secure = true;
				cookieOptions.sameSite = 'lax';
			} else {
				// Development (HTTP) - Explicitly set lax to allow redirect cookies on localhost
				cookieOptions.secure = false;
				cookieOptions.sameSite = 'lax';
			}

			cookies.set('state', provider.state, cookieOptions);
			cookies.set('verifier', provider.codeVerifier, cookieOptions);

			const redirectURL = `${url.origin}/oauth/callback`;

			// PocketBase constructs the URL with redirect_uri appended at the end
			authUrl = `${provider.authUrl}${redirectURL}`;
		} catch (err) {
			console.error('OAuth2 Action Error:', err);
			return fail(500, { message: "Erreur interne lors de l'initialisation OAuth." });
		}

		if (authUrl) {
			throw redirect(303, authUrl);
		}

		return fail(500, { message: 'Failed to generate auth URL' });
	}
};
