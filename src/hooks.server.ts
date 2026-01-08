import type { Handle } from '@sveltejs/kit';
import { createInstance } from '$lib/pocketbase';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.pb = createInstance();

	// loadFromCookie handles an empty string gracefully if no cookie exists
	event.locals.pb.authStore.loadFromCookie(event.request.headers.get('cookie') || '');

	try {
		if (event.locals.pb.authStore.isValid) {
			// Optional: Sync with DB to ensure the user hasn't been banned/deleted since token issuance
			await event.locals.pb.collection('users').authRefresh();
			event.locals.user = event.locals.pb.authStore.record;
		} else {
			event.locals.user = null;
		}
	} catch (_) {
		// Clear store if server-side validation fails (e.g. invalid token)
		event.locals.pb.authStore.clear();
		event.locals.user = null;
	}

	const response = await resolve(event);

	// "httpOnly: false" allows the client-side JS SDK to read the token.
	// This is required for client-side subscriptions (pb.collection(...).subscribe).
	// In a strictly server-side rendered app, you should set this to true.
	response.headers.set(
		'set-cookie',
		event.locals.pb.authStore.exportToCookie({ httpOnly: false, secure: false })
		// Note: set secure: true in production
	);

	return response;
};
