import type { Handle } from '@sveltejs/kit';
import { createInstance } from '$lib/pocketbase';
import { dev } from '$app/environment';
import { resolve as resolvePath } from '$app/paths';
import type { UsersResponse, SuperusersResponse } from '$lib/pocketbase-types';

export const handle: Handle = async ({ event, resolve }) => {
	// Initialize PocketBase instance for the current request
	event.locals.pb = createInstance();

	// Load the authentication state from the incoming cookie
	const cookieHeader = event.request.headers.get('cookie') || '';
	event.locals.pb.authStore.loadFromCookie(cookieHeader);

	try {
		if (event.locals.pb.authStore.isValid && event.locals.pb.authStore.record) {
			const collectionName = event.locals.pb.authStore.record.collectionName;

			if (collectionName === '_superusers') {
				// Refresh the admin token
				await event.locals.pb.collection('_superusers').authRefresh();
				event.locals.user = event.locals.pb.authStore.record as SuperusersResponse;
			} else if (collectionName === 'users') {
				// Refresh the staff token
				await event.locals.pb.collection('users').authRefresh();
				event.locals.user = event.locals.pb.authStore.record as UsersResponse;

				// Expand campus information for the layout (Staff only)
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const staffUser = event.locals.user as any;
				if (staffUser.campus) {
					try {
						const campus = await event.locals.pb
							.collection('campuses')
							.getOne(staffUser.campus);
						if (!staffUser.expand) staffUser.expand = {};
						staffUser.expand.campus = campus;
					} catch (e) {
						console.error('Failed to fetch user campus details', e);
					}
				}
			} else {
				// Unrecognized collection, clear the auth store
				event.locals.pb.authStore.clear();
				event.locals.user = null;
			}

			// --- ROUTING GUARDS (Security) ---
			const currentPath = event.url.pathname;

			const pathOnboarding = new URL(resolvePath('/onboarding'), event.url).pathname;
			const pathLogout = new URL(resolvePath('/logout'), event.url).pathname;
			const pathOAuth = new URL(resolvePath('/oauth'), event.url).pathname;
			const pathAdmin = new URL(resolvePath('/admin'), event.url).pathname;
			const pathAdminLogin = new URL(resolvePath('/admin/login'), event.url).pathname;

			const isPublicPath =
				currentPath.startsWith(pathOnboarding) ||
				currentPath.startsWith(pathLogout) ||
				currentPath.startsWith(pathOAuth) ||
				currentPath.startsWith(pathAdminLogin);

			const isAdminPath = currentPath.startsWith(pathAdmin);

			if (event.locals.user) {
				if (event.locals.user.collectionName === '_superusers') {
					// 1. Admins should not access the Staff app, redirect them to /admin
					// (Exception: allow access to /logout)
					if (!isAdminPath && !currentPath.startsWith(pathLogout)) {
						return Response.redirect(new URL(resolvePath('/admin'), event.url).href, 303);
					}
				} else if (event.locals.user.collectionName === 'users') {
					// 2. Staff cannot access admin routes
					if (isAdminPath) {
						return Response.redirect(new URL(resolvePath('/'), event.url).href, 303);
					}

					// 3. Force Campus selection for Staff (Onboarding)
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const staffUser = event.locals.user as any;
					if (!staffUser.campus && !isPublicPath) {
						return Response.redirect(new URL(resolvePath('/onboarding'), event.url).href, 303);
					}
				}
			}
		} else {
			event.locals.user = null;
		}
	} catch (err) {
		// Clear the store if server-side validation fails
		event.locals.pb.authStore.clear();
		event.locals.user = null;
	}

	// Protect /admin routes for unauthenticated users
	const currentPath = event.url.pathname;
	const pathAdmin = new URL(resolvePath('/admin'), event.url).pathname;
	const pathAdminLogin = new URL(resolvePath('/admin/login'), event.url).pathname;

	if (currentPath.startsWith(pathAdmin) && !currentPath.startsWith(pathAdminLogin) && !event.locals.user) {
		return Response.redirect(new URL(resolvePath('/admin/login'), event.url).href, 303);
	}

	const response = await resolve(event);

	// Use 'lax' to ensure the cookie survives after an OAuth redirect
	const cookie = event.locals.pb.authStore.exportToCookie({
		httpOnly: false,
		secure: !dev,
		sameSite: 'lax'
	});

	response.headers.append('set-cookie', cookie);

	return response;
};
