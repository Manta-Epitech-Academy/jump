import { createInstance } from '$lib/pocketbase';
import { env } from '$env/dynamic/private';
import { resolve as resolvePath } from '$app/paths';
import type {
  UsersResponse,
  SuperusersResponse,
  StudentsResponse,
} from '$lib/pocketbase-types';
import type { RequestEvent } from '@sveltejs/kit';
import { CustomAuthStore, type CookieOptions } from './CustomAuthStore';
import type PocketBase from 'pocketbase';

export { CustomAuthStore, type CookieOptions } from './CustomAuthStore';
export { applyRouteGuards } from './guards';

function createPocketBase(cookieName: string) {
  const pb = createInstance();
  pb.authStore = new CustomAuthStore(cookieName);
  return pb;
}

// ==========================================
// GLOBAL SYSTEM CLIENT (Server Operations)
// ==========================================
const globalSystemClient = createInstance();
globalSystemClient.autoCancellation(false);

export async function getSystemClient() {
  if (!globalSystemClient.authStore.isValid) {
    try {
      await globalSystemClient
        .collection('_superusers')
        .authWithPassword(env.PB_ADMIN_EMAIL!, env.PB_ADMIN_PASS!, {
          autoRefreshThreshold: 30 * 60,
        });
    } catch (err) {
      console.error(
        "Erreur critique: Impossible d'authentifier le client System PB",
        err,
      );
    }
  }
  return globalSystemClient;
}

export function createAllContexts(cookieHeader: string) {
  const adminPb = createPocketBase('pb_admin_auth');
  const staffPb = createPocketBase('pb_staff_auth');
  const studentPb = createPocketBase('pb_student_auth');

  adminPb.authStore.loadFromCookie(cookieHeader);
  staffPb.authStore.loadFromCookie(cookieHeader);
  studentPb.authStore.loadFromCookie(cookieHeader);

  return { adminPb, staffPb, studentPb };
}

async function refreshAdmin(adminPb: PocketBase) {
  try {
    if (adminPb.authStore.isValid && adminPb.authStore.token) {
      await adminPb.collection('_superusers').authRefresh();
    }
  } catch {
    adminPb.authStore.clear();
  }
}

async function refreshStaff(staffPb: PocketBase) {
  try {
    if (staffPb.authStore.isValid && staffPb.authStore.token) {
      await staffPb.collection('users').authRefresh();
    }
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = error as any;
    console.warn(
      'User auth refresh failed:',
      err.originalError?.message || err,
    );
    staffPb.authStore.clear();
    return;
  }

  // Expand campus information for the layout — isolated from auth refresh
  // so a campus fetch failure never clears the auth store.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const staffUser = staffPb.authStore.record as any;
  if (staffUser?.campus) {
    try {
      const campus = await staffPb
        .collection('campuses')
        .getOne(staffUser.campus);
      if (!staffUser.expand) staffUser.expand = {};
      staffUser.expand.campus = campus;
    } catch (e) {
      console.error('Failed to fetch user campus details', e);
    }
  }
}

async function refreshStudent(studentPb: PocketBase) {
  try {
    if (studentPb.authStore.isValid && studentPb.authStore.token) {
      await studentPb.collection('students').authRefresh();
    }
  } catch {
    studentPb.authStore.clear();
  }
}

export async function refreshAll(
  adminPb: PocketBase,
  staffPb: PocketBase,
  studentPb: PocketBase,
) {
  await Promise.all([
    // Refresh Admin Token (Human admins)
    refreshAdmin(adminPb),
    // Refresh User Token (Staff) + expand campus
    refreshStaff(staffPb),
    // Refresh Student Token
    refreshStudent(studentPb),
  ]);
}

export function setLocals(
  event: RequestEvent,
  adminPb: PocketBase,
  staffPb: PocketBase,
  studentPb: PocketBase,
  systemPb: PocketBase,
) {
  const currentPath = event.url.pathname;
  const routeId = event.route.id || '';

  const pathAdmin = new URL(resolvePath('/admin'), event.url).pathname;
  const isAdminPath =
    currentPath === pathAdmin || currentPath.startsWith(`${pathAdmin}/`);
  const isCamperRoute = routeId.startsWith('/(camper)');

  // Expose specific instances
  event.locals.adminPb = adminPb;
  event.locals.staffPb = staffPb;
  event.locals.studentPb = studentPb;
  event.locals.systemPb = systemPb;

  // Set Auth Locals
  event.locals.user = null;
  event.locals.student = studentPb.authStore.record as StudentsResponse | null;

  if (isAdminPath) {
    event.locals.pb = adminPb;
    event.locals.user = adminPb.authStore.record as SuperusersResponse | null;
  } else if (isCamperRoute) {
    event.locals.pb = studentPb;
  } else {
    event.locals.pb = staffPb;
    event.locals.user = staffPb.authStore.record as UsersResponse | null;
  }
}

export function exportAllCookies(
  response: Response,
  adminPb: PocketBase,
  staffPb: PocketBase,
  studentPb: PocketBase,
  dev: boolean,
) {
  const cookieOpts: Partial<CookieOptions> = {
    httpOnly: false,
    secure: !dev,
    sameSite: 'Lax',
  };

  response.headers.append(
    'set-cookie',
    adminPb.authStore.exportToCookie(cookieOpts),
  );
  response.headers.append(
    'set-cookie',
    staffPb.authStore.exportToCookie(cookieOpts),
  );
  response.headers.append(
    'set-cookie',
    studentPb.authStore.exportToCookie(cookieOpts),
  );
}
