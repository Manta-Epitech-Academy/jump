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

		// 4. Update Meta (Name & Avatar)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const updateData: any = {
			name: authData.meta?.name || authData.record.username
		};

		// Microsoft specific: Fetch avatar from Graph API using the Access Token
		// (Microsoft does not provide a public avatarUrl in the initial OAuth response)
		if (!authData.record.avatar && provider.name === 'microsoft') {
			try {
				const response = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
					headers: {
						Authorization: `Bearer ${authData.meta?.accessToken}`
					}
				});

				if (response.ok) {
					const buffer = await response.arrayBuffer();
					const type = response.headers.get('content-type') || 'image/jpeg';
					// Use the content-type to determine extension, default to .jpg
					const ext = type.includes('png') ? 'png' : 'jpg';

					const file = new File([buffer], `avatar.${ext}`, { type });
					updateData.avatar = file;
				}
			} catch (imgErr) {
				console.error('Failed to download Microsoft avatar:', imgErr);
			}
		}
		// Generic Fallback: If user has no avatar in DB, but provider gives a public URL
		else if (!authData.record.avatar && authData.meta?.avatarUrl) {
			try {
				const response = await fetch(authData.meta.avatarUrl);
				if (response.ok) {
					const buffer = await response.arrayBuffer();
					// Create a File object from the buffer
					const file = new File([buffer], 'avatar.jpg', { type: 'image/jpeg' });
					updateData.avatar = file;
				}
			} catch (imgErr) {
				console.error('Failed to download OAuth avatar:', imgErr);
			}
		}

		await locals.pb.collection('users').update(authData.record.id, updateData);
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
