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
  const pathOAuth = new URL(resolvePath('/oauth' as any), event.url).pathname;
  const pathPublicShowcase = new URL(resolvePath('/p/' as any), event.url)
    .pathname;
  const pathApi = new URL(resolvePath('/api/' as any), event.url).pathname;

  const pathLogin = new URL(resolvePath('/login'), event.url).pathname;

  const isPublicPath =
    currentPath.startsWith(pathOnboarding) ||
    currentPath.startsWith(pathLogout) ||
    currentPath.startsWith(pathOAuth) ||
    currentPath.startsWith(pathAdminLogin) ||
    currentPath === pathLogin ||
    currentPath.startsWith(pathPublicShowcase) ||
    currentPath.startsWith(pathApi);

  // --- Camper Guards ---
  const pathCamperLogin = new URL(resolvePath('/camper/login'), event.url)
    .pathname;
  const pathCamperRoot = new URL(resolvePath('/camper'), event.url).pathname;

  const pathCamperCharter = new URL(resolvePath('/camper/charter'), event.url)
    .pathname;

  const pathCamperOAuth = new URL(resolvePath('/camper/oauth'), event.url)
    .pathname;

  if (isCamperRoute) {
    if (
      !event.locals.studentProfile &&
      currentPath !== pathCamperLogin &&
      !currentPath.startsWith(pathCamperOAuth)
    ) {
      return Response.redirect(new URL(pathCamperLogin, event.url).href, 303);
    }
    if (event.locals.studentProfile && currentPath === pathCamperLogin) {
      return Response.redirect(new URL(pathCamperRoot, event.url).href, 303);
    }

    // Charter guard: redirect to charter page if not accepted yet
    if (
      event.locals.studentProfile &&
      !event.locals.studentProfile.charterAcceptedAt &&
      currentPath !== pathCamperCharter &&
      currentPath !== pathCamperLogin
    ) {
      return Response.redirect(new URL(pathCamperCharter, event.url).href, 303);
    }

    // Already accepted: prevent going back to charter page
    if (
      event.locals.studentProfile?.charterAcceptedAt &&
      currentPath === pathCamperCharter
    ) {
      return Response.redirect(new URL(pathCamperRoot, event.url).href, 303);
    }
  } else if (!isPublicPath && !isAdminPath) {
    // --- Auth + Role Isolation for Staff App ---
    if (!event.locals.user) {
      return Response.redirect(new URL(pathLogin, event.url).href, 303);
    }
    if (event.locals.user.role === 'student') {
      return Response.redirect(new URL(pathCamperRoot, event.url).href, 303);
    }
  }

  // --- Staff/Admin Guards ---
  if (isAdminPath) {
    if (
      !currentPath.startsWith(pathAdminLogin) &&
      event.locals.user?.role !== 'admin'
    ) {
      return Response.redirect(new URL(pathAdminLogin, event.url).href, 303);
    }
  } else if (!isCamperRoute && !isPublicPath) {
    if (event.locals.user && !event.locals.staffProfile?.campusId) {
      return Response.redirect(new URL(pathOnboarding, event.url).href, 303);
    }
  }

  return null;
}
