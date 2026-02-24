import type { Handle } from '@sveltejs/kit';
import { createInstance } from '$lib/pocketbase';
import { dev } from '$app/environment';
import { resolve as resolvePath } from '$app/paths';
import type { UsersResponse, SuperusersResponse } from '$lib/pocketbase-types';
import { BaseAuthStore } from 'pocketbase';

// --- Custom Store Implementation ---

interface CookieOptions {
	httpOnly: boolean;
	secure: boolean;
	sameSite: 'Lax' | 'Strict' | 'None';
	path: string;
	expires: Date;
}

class CustomAuthStore extends BaseAuthStore {
	constructor(private cookieName: string) {
		super();
	}

	loadFromCookie(cookieHeader: string) {
		const cookie = cookieHeader
			.split(';')
			.find((c) => c.trim().startsWith(`${this.cookieName}=`));
		if (!cookie) return this.clear();

		try {
			const cookieValue = cookie.substring(cookie.indexOf('=') + 1);
			const { token, model } = JSON.parse(decodeURIComponent(cookieValue));
			this.save(token, model);
		} catch {
			this.clear();
		}
	}

	exportToCookie(options: Partial<CookieOptions> = {}): string {
		if (!this.token)
			return `${this.cookieName}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;

		const opts: CookieOptions = {
			httpOnly: true,
			secure: true,
			sameSite: 'Lax',
			path: '/',
			expires: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
			...options
		};

		const value = encodeURIComponent(JSON.stringify({ token: this.token, model: this.record }));
		let cookieString = `${this.cookieName}=${value}; Path=${opts.path}; Expires=${opts.expires.toUTCString()}`;

		if (opts.httpOnly) {
			cookieString += `; HttpOnly`;
		}

		cookieString += `; SameSite=${opts.sameSite}`;
		if (opts.secure) {
			cookieString += `; Secure`;
		}

		return cookieString;
	}
}

// Helper to create a PB instance with a specific cookie name
const createPocketBase = (cookieName: string) => {
	const pb = createInstance();
	pb.authStore = new CustomAuthStore(cookieName);
	return pb;
};

export const handle: Handle = async ({ event, resolve }) => {
	// 1. Initialize two distinct instances
	const adminPb = createPocketBase('pb_admin_auth');
	const userPb = createPocketBase('pb_user_auth');

	// 2. Load auth state from request cookies
	const cookieHeader = event.request.headers.get('cookie') || '';
	adminPb.authStore.loadFromCookie(cookieHeader);
	userPb.authStore.loadFromCookie(cookieHeader);

	// 3. Refresh Admin Token
	try {
		if (adminPb.authStore.isValid && adminPb.authStore.token) {
			await adminPb.collection('_superusers').authRefresh();
		}
	} catch (_) {
		adminPb.authStore.clear();
	}

	// 4. Refresh User Token
	try {
		if (userPb.authStore.isValid && userPb.authStore.token) {
			await userPb.collection('users').authRefresh();

			// Expand campus information for the layout (Staff only)
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const staffUser = userPb.authStore.record as any;
			if (staffUser && staffUser.campus) {
				try {
					const campus = await userPb.collection('campuses').getOne(staffUser.campus);
					if (!staffUser.expand) staffUser.expand = {};
					staffUser.expand.campus = campus;
				} catch (e) {
					console.error('Failed to fetch user campus details', e);
				}
			}
		}
	} catch (error) {
		// Token might be invalid or expired
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const err = error as any;
		console.warn(
			'User auth refresh failed:',
			err.originalError?.message || err
		);
		userPb.authStore.clear();
	}

	// 5. Determine Context (Admin vs App) and map to event.locals
	const currentPath = event.url.pathname;
	const pathAdmin = new URL(resolvePath('/admin'), event.url).pathname;
	const pathAdminLogin = new URL(resolvePath('/admin/login'), event.url).pathname;

	// Strictly match the admin path to prevent catching apps named /admin-something
	const isAdminPath = currentPath === pathAdmin || currentPath.startsWith(`${pathAdmin}/`);

	// Expose specific instances in case we need to access one from the other context (e.g. logout)
	event.locals.adminPb = adminPb;
	event.locals.userPb = userPb;

	if (isAdminPath) {
		// Context: ADMIN
		event.locals.pb = adminPb;
		event.locals.user = adminPb.authStore.record as SuperusersResponse | null;
	} else {
		// Context: APP (User/Staff)
		event.locals.pb = userPb;
		event.locals.user = userPb.authStore.record as UsersResponse | null;
	}

	// 6. Routing Guards
	const pathOnboarding = new URL(resolvePath('/onboarding'), event.url).pathname;
	const pathLogout = new URL(resolvePath('/logout'), event.url).pathname;
	const pathOAuth = new URL(resolvePath('/oauth'), event.url).pathname;

	const isPublicPath =
		currentPath.startsWith(pathOnboarding) ||
		currentPath.startsWith(pathLogout) ||
		currentPath.startsWith(pathOAuth) ||
		currentPath.startsWith(pathAdminLogin);

	if (isAdminPath) {
		if (!currentPath.startsWith(pathAdminLogin) && !event.locals.user) {
			return Response.redirect(new URL(resolvePath('/admin/login'), event.url).href, 303);
		}
	} else {
		if (event.locals.user) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const staffUser = event.locals.user as any;
			if (!staffUser.campus && !isPublicPath) {
				return Response.redirect(new URL(resolvePath('/onboarding'), event.url).href, 303);
			}
		}
	}

	const response = await resolve(event);

	// 7. Export Cookies (Both are sent to keep sessions alive/synced)
	// Use 'lax' to ensure the cookie survives after redirects
	const cookieOpts: Partial<CookieOptions> = {
		httpOnly: false,
		secure: !dev,
		sameSite: 'Lax'
	};

	response.headers.append('set-cookie', adminPb.authStore.exportToCookie(cookieOpts));
	response.headers.append('set-cookie', userPb.authStore.exportToCookie(cookieOpts));

	return response;
};
