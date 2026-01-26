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
