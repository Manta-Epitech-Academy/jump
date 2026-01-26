import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies, locals }) => {
	const expectedState = cookies.get('state');
	const expectedVerifier = cookies.get('verifier');

	const state = url.searchParams.get('state');
	const code = url.searchParams.get('code');

	// Ensure the redirect URL matches EXACTLY what was sent in login/+page.server.ts
	const redirectURL = `${url.origin}/oauth/callback`;

	// 1. Validate State
	if (!state || !expectedState || state !== expectedState) {
		throw redirect(303, '/login?error=OAuthStateMismatch');
	}

	// 2. Find Provider
	const authMethods = await locals.pb.collection('users').listAuthMethods();
	const providers = authMethods.oauth2?.providers || authMethods.authProviders || [];
	const provider = providers.find((p) => p.name === 'microsoft');

	if (!provider) {
		throw redirect(303, '/login?error=ProviderMissing');
	}

	// 3. Exchange Code
	try {
		const authData = await locals.pb
			.collection('users')
			.authWithOAuth2Code(provider.name, code!, expectedVerifier!, redirectURL);

		// --- SECURITY CHECK: DEFENSE IN DEPTH ---
		// Even if Azure is set to Single Tenant, this double-checks the domain in code.
		// If Azure config fails or changes, this protects your app.
		const email = authData.record.email || authData.meta?.email || '';

		if (!email.endsWith('@epitech.eu')) {
			// 1. Delete the user PocketBase just auto-created
			await locals.pb.collection('users').delete(authData.record.id);
			// 2. Clear the auth store (logout)
			locals.pb.authStore.clear();
			// 3. Redirect to login with the specific error message your login page expects
			throw redirect(303, '/login?error=UnauthorizedDomain');
		}
		// ----------------------------------------

		// 4. Update Meta (Optional)
		await locals.pb.collection('users').update(authData.record.id, {
			name: authData.meta?.name || authData.record.username,
			avatarUrl: authData.meta?.avatarUrl
		});
	} catch (err) {
		// Catch redirects (including our new UnauthorizedDomain redirect)
		// and re-throw them so SvelteKit handles them properly
		if (err instanceof Response) throw err;

		console.error('OAuth Exchange Failed:', err);
		throw redirect(303, '/login?error=OAuthFailed');
	}

	// 5. Cleanup & Redirect
	const clearOptions = { path: '/', secure: !dev, sameSite: 'lax' as const };
	cookies.delete('state', clearOptions);
	cookies.delete('verifier', clearOptions);

	throw redirect(303, '/');
};
