import { error, type RequestEvent } from '@sveltejs/kit';
import { resolve as resolvePath } from '$app/paths';
import type { StaffRole } from '@prisma/client';
import { getStaffRoleRedirectPath } from '$lib/domain/staff';
import { prisma } from '$lib/server/db';
import { can, type StaffGroup } from '$lib/domain/permissions';
import { getOnboardingStep } from '$lib/domain/talentOnboarding';
import { STAGE_DEFAULT_DURATION_DAYS } from '$lib/domain/event';
import {
  loginUrlWithRedirect,
  onboardingFunnelUrl,
} from '$lib/server/auth/loginRedirect';

function forbidGroup(group: StaffGroup): never {
  throw error(403, {
    message: 'Action réservée.',
    code: 'staff_group_required',
    group,
  });
}

export async function applyRouteGuards(
  event: RequestEvent,
): Promise<Response | null> {
  const currentPath = event.url.pathname;
  const routeId = event.route.id || '';

  const p = (path: string) =>
    new URL(resolvePath(path as any), event.url).pathname;

  const pathStaffLogin = p('/staff/login');
  const pathStaffOAuth = p('/staff/oauth');
  const pathStaffAdmin = p('/staff/admin');
  const pathTalentLogin = p('/login');
  const pathTalentRoot = p('/');
  const pathTalentOnboarding = p('/onboarding');
  const pathTalentOAuth = p('/oauth');
  const pathLogout = p('/logout');
  const pathApi = p('/api/');
  const pathStaffDev = p('/staff/dev');

  const pathTalentWelcome = p('/welcome');
  const pathParentLogin = p('/login');
  const pathParentFastlogin = p('/parent/fastlogin');
  const pathParentWelcome = p('/parent/welcome');
  const pathParentReglement = p('/parent/reglement');
  const pathParentSignature = p('/parent/signature');
  const pathParentMerci = p('/parent/merci');

  const isTalentRoute = routeId.startsWith('/(talent)');
  const isStaffRoute = routeId.startsWith('/(staff)');
  const isParentRoute = routeId.startsWith('/(parent)');
  const isAdminPath =
    currentPath === pathStaffAdmin ||
    currentPath.startsWith(`${pathStaffAdmin}/`);
  const isDevPath =
    currentPath === pathStaffDev || currentPath.startsWith(`${pathStaffDev}/`);

  const isPublicPath =
    currentPath.startsWith(pathLogout) || currentPath.startsWith(pathApi);

  // --- Talent Guards ---
  if (isTalentRoute) {
    const isTalentPublic =
      currentPath === pathTalentLogin ||
      currentPath.startsWith(pathTalentOAuth);

    if (!event.locals.talent && !isTalentPublic) {
      return Response.redirect(
        new URL(loginUrlWithRedirect(pathTalentLogin, event.url), event.url)
          .href,
        303,
      );
    }
    if (event.locals.talent && currentPath === pathTalentLogin) {
      return Response.redirect(new URL(pathTalentRoot, event.url).href, 303);
    }

    // Welcome guard: first-time stage talents see the welcome splash before
    // onboarding. `markSeen` sets `welcomeSeenAt` and hands off to onboarding,
    // so this short-circuits on every later request. The splash content is
    // fixed and owned by the page itself — it is NOT gated on the CMS `welcome`
    // row, which now feeds only the dashboard's Actualités card.
    if (
      event.locals.talent &&
      !event.locals.talent.welcomeSeenAt &&
      currentPath !== pathTalentWelcome &&
      !currentPath.startsWith(pathTalentOnboarding) &&
      currentPath !== pathTalentLogin
    ) {
      // Show the splash while the talent has any stage whose window is still
      // open. "Window" = the explicit endDate, or date + default duration when
      // none (mirrors `stageWindowEnd` so an endDate-less mini-stage doesn't
      // lose the splash the day after it starts). Existence is enough - with
      // several concurrent stages, any open one triggers it.
      const now = new Date();
      const windowLookback = new Date(
        now.getTime() - STAGE_DEFAULT_DURATION_DAYS * 86_400_000,
      );
      const stageParticipation = await prisma.participation.findFirst({
        where: {
          talentId: event.locals.talent.id,
          event: {
            eventType: 'stage_seconde',
            OR: [
              { endDate: { gte: now } },
              { endDate: null, date: { gte: windowLookback } },
            ],
          },
        },
        select: { id: true },
      });
      if (stageParticipation) {
        return Response.redirect(
          new URL(onboardingFunnelUrl(pathTalentWelcome, event.url), event.url)
            .href,
          303,
        );
      }
    }

    // Onboarding guard: redirect until every step of the canonical ladder is
    // done. `getOnboardingStep` is the single source of truth shared with the
    // wizard's resume logic and the admin progress label — so a step added there
    // is gated here automatically, with no parallel field list to keep in sync.
    if (event.locals.talent) {
      const needsOnboarding = getOnboardingStep(event.locals.talent) !== null;

      if (
        needsOnboarding &&
        !currentPath.startsWith(pathTalentOnboarding) &&
        currentPath !== pathTalentWelcome &&
        currentPath !== pathTalentLogin
      ) {
        return Response.redirect(
          new URL(
            onboardingFunnelUrl(pathTalentOnboarding, event.url),
            event.url,
          ).href,
          303,
        );
      }

      // Already completed: prevent going back to onboarding
      if (!needsOnboarding && currentPath.startsWith(pathTalentOnboarding)) {
        return Response.redirect(new URL(pathTalentRoot, event.url).href, 303);
      }
    }

    // Charter guard. `charterAcceptedAt` is set at the end of onboarding (same
    // transaction as `rulesSignedAt`), so a talent missing it hasn't finished
    // onboarding and is already caught by the onboarding guard above. This stays
    // as a defensive net: send any talent without the charter back through
    // onboarding, where it is signed. (The old standalone `/charter` page was
    // retired once the charter folded into the onboarding rules step.)
    if (
      event.locals.talent &&
      !event.locals.talent.charterAcceptedAt &&
      !currentPath.startsWith(pathTalentOnboarding) &&
      currentPath !== pathTalentWelcome &&
      currentPath !== pathTalentLogin
    ) {
      return Response.redirect(
        new URL(pathTalentOnboarding, event.url).href,
        303,
      );
    }
  }

  // --- Staff Guards ---
  if (isStaffRoute) {
    const isStaffPublic =
      currentPath === pathStaffLogin || currentPath.startsWith(pathStaffOAuth);

    if (!isStaffPublic && !event.locals.user) {
      return Response.redirect(
        new URL(loginUrlWithRedirect(pathStaffLogin, event.url), event.url)
          .href,
        303,
      );
    }

    // Students without a staff profile shouldn't access staff area.
    // The staffProfile check covers dual-role users whose cached
    // bauth_user.role is still 'student' from their Talent identity.
    if (
      !isStaffPublic &&
      event.locals.user?.role === 'student' &&
      !event.locals.staffProfile
    ) {
      return Response.redirect(new URL(pathTalentRoot, event.url).href, 303);
    }

    // Admin sub-guard
    if (isAdminPath) {
      if (event.locals.staffProfile?.staffRole !== 'admin') {
        return Response.redirect(new URL(pathStaffLogin, event.url).href, 303);
      }
    }

    // Dev sub-guard: only the dev workspace's members.
    if (isDevPath) {
      const role = event.locals.staffProfile?.staffRole;
      if (!can('devMember', role)) {
        const correctPath = getStaffRoleRedirectPath(role);
        if (correctPath) {
          return Response.redirect(
            new URL(p(correctPath), event.url).href,
            303,
          );
        }
        return Response.redirect(
          new URL(`${pathStaffLogin}?error=NoRole`, event.url).href,
          303,
        );
      }
    }
  }

  // --- Parent Guards ---
  if (isParentRoute) {
    // `/parent/fastlogin` forges the session itself (magic-link token), so it
    // must be reachable without one — same exemption as `/parent/login`.
    // Without this the guard bounces the unauthenticated clicker to login and
    // the endpoint never runs.
    const isParentPublic =
      currentPath === pathParentLogin || currentPath === pathParentFastlogin;

    if (
      !isParentPublic &&
      (!event.locals.user || event.locals.user.role !== 'parent')
    ) {
      return Response.redirect(new URL(pathParentLogin, event.url).href, 303);
    }
    if (
      event.locals.user?.role === 'parent' &&
      currentPath === pathParentLogin
    ) {
      return Response.redirect(new URL(pathParentWelcome, event.url).href, 303);
    }

    // Parent flow: welcome → règlement → droit-image → merci
    // The guardian has two legal acts per child — co-signing the règlement
    // intérieur and deciding image rights. A child is "pending" until both are
    // settled (a refusal counts as a settled image-rights decision). While any
    // child is pending the parent stays inside the flow pages, which order the
    // steps themselves and skip whatever is already done. Once nothing is
    // pending they land on /parent/merci (no dashboard in this release).
    if (event.locals.user?.role === 'parent' && !isParentPublic) {
      const pendingCount = await prisma.talent.count({
        where: {
          parentEmail: event.locals.user.email,
          OR: [{ parentRulesSignedAt: null }, { imageRightsDecidedAt: null }],
        },
      });

      if (pendingCount > 0) {
        if (
          currentPath !== pathParentWelcome &&
          currentPath !== pathParentReglement &&
          currentPath !== pathParentSignature
        ) {
          return Response.redirect(
            new URL(pathParentWelcome, event.url).href,
            303,
          );
        }
      } else {
        // All signed — always land on merci (no dashboard in this release)
        if (currentPath !== pathParentMerci) {
          return Response.redirect(
            new URL(pathParentMerci, event.url).href,
            303,
          );
        }
      }
    }
  }

  return null;
}

/**
 * Gate a route or an action on a role group. Throws 403 with the group name so
 * `(staff)/+error.svelte` can name who to ask. Call it at the top of a `load`
 * to gate a whole route, or in an action to gate one mutation.
 */
export function requireStaffGroup(
  locals: App.Locals,
  group: StaffGroup,
): asserts locals is App.Locals & {
  staffProfile: NonNullable<App.Locals['staffProfile']> & {
    staffRole: StaffRole;
  };
} {
  if (can(group, locals.staffProfile?.staffRole)) return;
  forbidGroup(group);
}
