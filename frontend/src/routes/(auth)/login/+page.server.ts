import type { Actions, PageServerLoad } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { dev } from '$app/environment';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.pb.authStore.isValid) {
		throw redirect(302, '/');
	}

	// Handle errors returned from the OAuth callback
	const errorType = url.searchParams.get('error');
	let errorMessage = '';

	if (errorType === 'UnauthorizedDomain') {
		errorMessage = 'Accès refusé. Veuillez utiliser une adresse @epitech.eu.';
	} else if (errorType === 'OAuthFailed') {
		errorMessage = "Échec de l'authentification Microsoft.";
	} else if (errorType === 'OAuthStateMismatch') {
		errorMessage = 'Erreur de sécurité (State Mismatch). Veuillez réessayer.';
	} else if (errorType === 'ProviderMissing') {
		errorMessage = "Le fournisseur d'authentification Microsoft n'est pas configuré.";
	}

	return {
		errorMessage
	};
};

export const actions: Actions = {
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
			authUrl = `${provider.authURL}${redirectURL}`;
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
