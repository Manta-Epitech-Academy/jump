import type { RequestEvent } from '@sveltejs/kit';
import { resolve as resolvePath } from '$app/paths';

export function applyRouteGuards(event: RequestEvent): Response | null {
  const currentPath = event.url.pathname;
  const routeId = event.route.id || '';

  // --- Path definitions ---
  const p = (path: string) =>
    new URL(resolvePath(path as any), event.url).pathname;

  const pathStaffLogin = p('/staff/login');
  const pathStaffOnboarding = p('/staff/onboarding');
  const pathStaffOAuth = p('/staff/oauth');
  const pathStaffAdmin = p('/staff/admin');
  const pathStaffAdminLogin = p('/staff/admin/login');
  const pathTalentLogin = p('/login');
  const pathTalentRoot = p('/');
  const pathTalentCharter = p('/charter');
  const pathTalentOnboarding = p('/onboarding');
  const pathTalentOAuth = p('/oauth');
  const pathLogout = p('/logout');
  const pathPublicShowcase = p('/p/');
  const pathApi = p('/api/');
  const pathParent = p('/parent');

  const isTalentRoute = routeId.startsWith('/(talent)');
  const isStaffRoute = routeId.startsWith('/(staff)');
  const isAdminPath =
    currentPath === pathStaffAdmin ||
    currentPath.startsWith(`${pathStaffAdmin}/`);

  const isPublicPath =
    currentPath.startsWith(pathLogout) ||
    currentPath.startsWith(pathPublicShowcase) ||
    currentPath.startsWith(pathApi) ||
    currentPath.startsWith(pathParent);

  // --- Talent Guards ---
  if (isTalentRoute) {
    const isTalentPublic =
      currentPath === pathTalentLogin ||
      currentPath.startsWith(pathTalentOAuth);

    if (!event.locals.talent && !isTalentPublic) {
      return Response.redirect(new URL(pathTalentLogin, event.url).href, 303);
    }
    if (event.locals.talent && currentPath === pathTalentLogin) {
      return Response.redirect(new URL(pathTalentRoot, event.url).href, 303);
    }

    // Onboarding guard: redirect if info or rules not signed yet
    if (event.locals.talent) {
      const needsOnboarding =
        !event.locals.talent.infoValidatedAt ||
        !event.locals.talent.rulesSignedAt;

      if (
        needsOnboarding &&
        !currentPath.startsWith(pathTalentOnboarding) &&
        currentPath !== pathTalentLogin
      ) {
        return Response.redirect(
          new URL(pathTalentOnboarding, event.url).href,
          303,
        );
      }

      // Already completed: prevent going back to onboarding
      if (!needsOnboarding && currentPath.startsWith(pathTalentOnboarding)) {
        return Response.redirect(new URL(pathTalentRoot, event.url).href, 303);
      }
    }

    // Charter guard
    if (
      event.locals.talent &&
      !event.locals.talent.charterAcceptedAt &&
      currentPath !== pathTalentCharter &&
      currentPath !== pathTalentLogin
    ) {
      return Response.redirect(new URL(pathTalentCharter, event.url).href, 303);
    }
    if (
      event.locals.talent?.charterAcceptedAt &&
      currentPath === pathTalentCharter
    ) {
      return Response.redirect(new URL(pathTalentRoot, event.url).href, 303);
    }
  }

  // --- Staff Guards ---
  if (isStaffRoute) {
    const isStaffPublic =
      currentPath === pathStaffLogin ||
      currentPath.startsWith(pathStaffOAuth) ||
      currentPath.startsWith(pathStaffAdminLogin) ||
      currentPath.startsWith(pathStaffOnboarding);

    if (!isStaffPublic && !event.locals.user) {
      return Response.redirect(new URL(pathStaffLogin, event.url).href, 303);
    }

    // Students shouldn't access staff area
    if (!isStaffPublic && event.locals.user?.role === 'student') {
      return Response.redirect(new URL(pathTalentRoot, event.url).href, 303);
    }

    // Admin sub-guard
    if (isAdminPath) {
      if (
        !currentPath.startsWith(pathStaffAdminLogin) &&
        event.locals.user?.role !== 'admin'
      ) {
        return Response.redirect(
          new URL(pathStaffAdminLogin, event.url).href,
          303,
        );
      }
    }

    // Onboarding guard: staff must have a campus
    if (
      !isStaffPublic &&
      !isAdminPath &&
      event.locals.user &&
      !event.locals.staffProfile?.campusId
    ) {
      return Response.redirect(
        new URL(pathStaffOnboarding, event.url).href,
        303,
      );
    }
  }

  return null;
}
