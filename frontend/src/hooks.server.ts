import type { Handle } from '@sveltejs/kit';
import { createInstance } from '$lib/pocketbase';
import { dev } from '$app/environment';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.pb = createInstance();

	const cookieHeader = event.request.headers.get('cookie') || '';
	event.locals.pb.authStore.loadFromCookie(cookieHeader);

	try {
		if (event.locals.pb.authStore.isValid) {
			// Refresh the token to ensure it's still valid in DB
			await event.locals.pb.collection('users').authRefresh();
			event.locals.user = event.locals.pb.authStore.record;

			// --- MULTI-TENANT LOGIC ---

			// 1. Expand campus information for the layout to use
			if (event.locals.user?.campus) {
				try {
					const campus = await event.locals.pb
						.collection('campuses')
						.getOne(event.locals.user.campus);
					// Manually attach expanded campus to the user object in memory
					if (!event.locals.user.expand) event.locals.user.expand = {};
					event.locals.user.expand.campus = campus;
				} catch (e) {
					console.error('Failed to fetch user campus details', e);
				}
			}

			// 2. Enforce Campus Selection (Onboarding)
			// If user has no campus, force them to /onboarding
			// Exceptions: /onboarding itself, /logout, /oauth (callbacks)
			const publicPaths = ['/onboarding', '/logout', '/oauth'];
			const isPublicPath = publicPaths.some((path) => event.url.pathname.startsWith(path));

			if (!event.locals.user?.campus && !isPublicPath) {
				return Response.redirect(`${event.url.origin}/onboarding`, 303);
			}
		} else {
			event.locals.user = null;
		}
	} catch (err) {
		// Clear store if server-side validation fails
		event.locals.pb.authStore.clear();
		event.locals.user = null;
	}

	const response = await resolve(event);

	// Use 'lax' for SameSite to ensure it survives the redirect from OAuth
	const cookie = event.locals.pb.authStore.exportToCookie({
		httpOnly: false,
		secure: !dev,
		sameSite: 'lax'
	});

	response.headers.append('set-cookie', cookie);

	return response;
};
