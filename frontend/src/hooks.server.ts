import type { Handle } from '@sveltejs/kit';
import { createInstance } from '$lib/pocketbase';
import { dev } from '$app/environment';
import { resolve as resolvePath } from '$app/paths';
import { env } from '$env/dynamic/private';
import type { UsersResponse, SuperusersResponse, StudentsResponse } from '$lib/pocketbase-types';
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
		const cookie = cookieHeader.split(';').find((c) => c.trim().startsWith(`${this.cookieName}=`));
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

// ==========================================
// GLOBAL SYSTEM CLIENT (Server Operations)
// ==========================================
const globalSystemClient = createInstance();

globalSystemClient.autoCancellation(false);

const getSystemClient = async () => {
	if (!globalSystemClient.authStore.isValid) {
		try {
			await globalSystemClient
				.collection('_superusers')
				.authWithPassword(env.PB_ADMIN_EMAIL, env.PB_ADMIN_PASS, { autoRefreshThreshold: 30 * 60 });
		} catch (err) {
			console.error("Erreur critique: Impossible d'authentifier le client System PB", err);
		}
	}
	return globalSystemClient;
};
// ==========================================

export const handle: Handle = async ({ event, resolve }) => {
	// 1. Initialize distinct instances
	const adminPb = createPocketBase('pb_admin_auth');
	const staffPb = createPocketBase('pb_staff_auth');
	const studentPb = createPocketBase('pb_student_auth');

	// 1.b Initialize global System instance for internal checks
	const systemPb = await getSystemClient();

	// 2. Load auth state from request cookies
	const cookieHeader = event.request.headers.get('cookie') || '';
	adminPb.authStore.loadFromCookie(cookieHeader);
	staffPb.authStore.loadFromCookie(cookieHeader);
	studentPb.authStore.loadFromCookie(cookieHeader);

	// 3. Refresh Admin Token (Human admins)
	try {
		if (adminPb.authStore.isValid && adminPb.authStore.token) {
			await adminPb.collection('_superusers').authRefresh();
		}
	} catch (_) {
		adminPb.authStore.clear();
	}

	// 4. Refresh User Token (Staff)
	try {
		if (staffPb.authStore.isValid && staffPb.authStore.token) {
			await staffPb.collection('users').authRefresh();

			// Expand campus information for the layout (Staff only)
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const staffUser = staffPb.authStore.record as any;
			if (staffUser && staffUser.campus) {
				try {
					const campus = await staffPb.collection('campuses').getOne(staffUser.campus);
					if (!staffUser.expand) staffUser.expand = {};
					staffUser.expand.campus = campus;
				} catch (e) {
					console.error('Failed to fetch user campus details', e);
				}
			}
		}
	} catch (error) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const err = error as any;
		console.warn('User auth refresh failed:', err.originalError?.message || err);
		staffPb.authStore.clear();
	}

	// 5. Refresh Student Token
	try {
		if (studentPb.authStore.isValid && studentPb.authStore.token) {
			await studentPb.collection('students').authRefresh();
		}
	} catch (error) {
		studentPb.authStore.clear();
	}

	// 6. Determine Context
	const currentPath = event.url.pathname;
	const routeId = event.route.id || '';

	const pathAdmin = new URL(resolvePath('/admin'), event.url).pathname;
	const pathAdminLogin = new URL(resolvePath('/admin/login'), event.url).pathname;

	const isAdminPath = currentPath === pathAdmin || currentPath.startsWith(`${pathAdmin}/`);
	const isCamperRoute = routeId.startsWith('/(camper)');

	// Expose specific instances
	event.locals.adminPb = adminPb;
	event.locals.staffPb = staffPb;
	event.locals.studentPb = studentPb;
	event.locals.systemPb = systemPb;

	// Set Auth Locals
	event.locals.user = null; // Default
	event.locals.student = studentPb.authStore.record as StudentsResponse | null;

	if (isAdminPath) {
		// Context: ADMIN
		event.locals.pb = adminPb;
		event.locals.user = adminPb.authStore.record as SuperusersResponse | null;
	} else if (isCamperRoute) {
		// Context: CAMPER
		event.locals.pb = studentPb;
		// Note: event.locals.user stays null here to signify "not a staff member context"
	} else {
		// Context: APP (User/Staff)
		event.locals.pb = staffPb;
		event.locals.user = staffPb.authStore.record as UsersResponse | null;
	}

	// 7. Routing Guards & Redirects

	// Define Public Paths used for exclusions
	const pathOnboarding = new URL(resolvePath('/onboarding'), event.url).pathname;
	const pathLogout = new URL(resolvePath('/logout'), event.url).pathname;
	const pathOAuth = new URL(resolvePath('/oauth'), event.url).pathname;
	const pathPublicShowcase = new URL(resolvePath('/p/'), event.url).pathname;

	const isPublicPath =
		currentPath.startsWith(pathOnboarding) ||
		currentPath.startsWith(pathLogout) ||
		currentPath.startsWith(pathOAuth) ||
		currentPath.startsWith(pathAdminLogin) ||
		currentPath.startsWith(pathPublicShowcase);

	// --- Camper Guards ---
	const pathCamperLogin = new URL(resolvePath('/camper/login'), event.url).pathname;
	const pathCamperRoot = new URL(resolvePath('/camper'), event.url).pathname;

	if (isCamperRoute) {
		// If accessing camper routes (except login) without student session -> Redirect to camper login
		if (!event.locals.student && currentPath !== pathCamperLogin) {
			return Response.redirect(new URL(pathCamperLogin, event.url).href, 303);
		}
		// If accessing login page while logged in -> Redirect to dashboard
		if (event.locals.student && currentPath === pathCamperLogin) {
			return Response.redirect(new URL(pathCamperRoot, event.url).href, 303);
		}
	} else {
		// --- Role Isolation: Student trying to access Staff App ---
		// If we are NOT in admin/camper routes (implies Staff App), and user is a Student but NOT a Staff
		// AND we are not trying to access a public route (like /logout or /p/)
		if (event.locals.student && !event.locals.user && !isAdminPath && !isPublicPath) {
			// Redirect them back to their portal
			return Response.redirect(new URL(pathCamperRoot, event.url).href, 303);
		}
	}

	// --- Existing Staff/Admin Guards ---
	if (isAdminPath) {
		if (!currentPath.startsWith(pathAdminLogin) && !event.locals.user) {
			return Response.redirect(new URL(pathAdminLogin, event.url).href, 303);
		}
	} else if (!isCamperRoute) {
		// Staff App Guards
		if (event.locals.user) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const staffUser = event.locals.user as any;
			if (!staffUser.campus && !isPublicPath) {
				return Response.redirect(new URL(pathOnboarding, event.url).href, 303);
			}
		}
	}

	const response = await resolve(event);

	// 8. Export Cookies
	const cookieOpts: Partial<CookieOptions> = {
		httpOnly: false,
		secure: !dev,
		sameSite: 'Lax'
	};

	response.headers.append('set-cookie', adminPb.authStore.exportToCookie(cookieOpts));
	response.headers.append('set-cookie', staffPb.authStore.exportToCookie(cookieOpts));
	response.headers.append('set-cookie', studentPb.authStore.exportToCookie(cookieOpts));

	return response;
};
