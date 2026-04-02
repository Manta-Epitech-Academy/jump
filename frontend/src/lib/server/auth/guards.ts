import type { RequestEvent } from '@sveltejs/kit';
import { resolve as resolvePath } from '$app/paths';

export function applyRouteGuards(event: RequestEvent): Response | null {
  const currentPath = event.url.pathname;
  const routeId = event.route.id || '';

  const pathAdmin = new URL(resolvePath('/admin'), event.url).pathname;
  const pathAdminLogin = new URL(resolvePath('/admin/login'), event.url)
    .pathname;

  const isAdminPath =
    currentPath === pathAdmin || currentPath.startsWith(`${pathAdmin}/`);
  const isCamperRoute = routeId.startsWith('/(camper)');

  // Define Public Paths used for exclusions
  const pathOnboarding = new URL(resolvePath('/onboarding'), event.url)
    .pathname;
  const pathLogout = new URL(resolvePath('/logout'), event.url).pathname;
  const pathOAuth = new URL(resolvePath('/oauth'), event.url).pathname;
  const pathPublicShowcase = new URL(resolvePath('/p/'), event.url).pathname;
  const pathApi = new URL(resolvePath('/api/'), event.url).pathname;

  const isPublicPath =
    currentPath.startsWith(pathOnboarding) ||
    currentPath.startsWith(pathLogout) ||
    currentPath.startsWith(pathOAuth) ||
    currentPath.startsWith(pathAdminLogin) ||
    currentPath.startsWith(pathPublicShowcase) ||
    currentPath.startsWith(pathApi);

  // --- Camper Guards ---
  const pathCamperLogin = new URL(resolvePath('/camper/login'), event.url)
    .pathname;
  const pathCamperRoot = new URL(resolvePath('/camper'), event.url).pathname;

  const pathCamperCharter = new URL(resolvePath('/camper/charter'), event.url)
    .pathname;

  if (isCamperRoute) {
    if (!event.locals.student && currentPath !== pathCamperLogin) {
      return Response.redirect(new URL(pathCamperLogin, event.url).href, 303);
    }
    if (event.locals.student && currentPath === pathCamperLogin) {
      return Response.redirect(new URL(pathCamperRoot, event.url).href, 303);
    }

    // Charter guard: redirect to charter page if not accepted yet
    if (
      event.locals.student &&
      !event.locals.student.charter_accepted_at &&
      currentPath !== pathCamperCharter &&
      currentPath !== pathCamperLogin
    ) {
      return Response.redirect(
        new URL(pathCamperCharter, event.url).href,
        303,
      );
    }

    // Already accepted: prevent going back to charter page
    if (
      event.locals.student?.charter_accepted_at &&
      currentPath === pathCamperCharter
    ) {
      return Response.redirect(new URL(pathCamperRoot, event.url).href, 303);
    }
  } else {
    // --- Role Isolation: Student trying to access Staff App ---
    if (
      event.locals.student &&
      !event.locals.user &&
      !isAdminPath &&
      !isPublicPath
    ) {
      return Response.redirect(new URL(pathCamperRoot, event.url).href, 303);
    }
  }

  // --- Staff/Admin Guards ---
  if (isAdminPath) {
    if (!currentPath.startsWith(pathAdminLogin) && !event.locals.user) {
      return Response.redirect(new URL(pathAdminLogin, event.url).href, 303);
    }
  } else if (!isCamperRoute) {
    if (event.locals.user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const staffUser = event.locals.user as any;
      if (!staffUser.campus && !isPublicPath) {
        return Response.redirect(new URL(pathOnboarding, event.url).href, 303);
      }
    }
  }

  return null;
}
