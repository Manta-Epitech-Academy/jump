import { error, type RequestEvent } from '@sveltejs/kit';
import { resolve as resolvePath } from '$app/paths';
import type { StaffRole } from '@prisma/client';
import { getStaffRoleRedirectPath } from '$lib/domain/staff';
import { prisma } from '$lib/server/db';
import { can, type StaffGroup } from '$lib/domain/permissions';
import {
  getOnboardingStep,
  onboardingFieldsForYear,
} from '$lib/domain/talentOnboarding';
import { currentSchoolYearLabel } from '$lib/domain/schoolYear';
import { isOnboardingEligible } from '$lib/domain/niveau';
import { parentBlockedWhere } from '$lib/server/db/dossierCompliance';
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
  const pathTalentCharte = p('/charte');
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

    // The school year both onboarding guards below ask about. The flat columns
    // on `Talent` hold the most recent dossier, which for a talent returning
    // after the summer is last year's; `onboardingFieldsForYear` reads them as
    // "nothing done" unless they are this year's, so a returning talent is sent
    // back through the wizard instead of walking in on last year's signature.
    const currentYear = currentSchoolYearLabel();

    // Welcome guard: a fresh talent sees the welcome splash once, before
    // onboarding. `markSeen` sets `welcomeSeenAt` and hands off to onboarding, so
    // this short-circuits on every later request. Gated purely on talent state
    // (never seen it AND still has onboarding to do), not on any event: the
    // splash copy is generic and owned by the page. The CMS `welcome` row feeds
    // only the dashboard's Actualités card, a separate surface.
    if (
      event.locals.talent &&
      !event.locals.talent.welcomeSeenAt &&
      getOnboardingStep(
        onboardingFieldsForYear(event.locals.talent, currentYear),
      ) !== null &&
      currentPath !== pathTalentWelcome &&
      !currentPath.startsWith(pathTalentOnboarding) &&
      currentPath !== pathTalentLogin
    ) {
      return Response.redirect(
        new URL(onboardingFunnelUrl(pathTalentWelcome, event.url), event.url)
          .href,
        303,
      );
    }

    // Who walks the ladder at all. Collégiens do not: the seminar settled that
    // Jump holds no reliable guardian contact for them, so they reach the app
    // without a dossier. Kept out of `getOnboardingStep`, whose contract is that
    // the step is a pure function of the timestamps set; eligibility is a
    // property of the talent's level, layered on top here.
    const walksOnboarding =
      event.locals.talent != null &&
      isOnboardingEligible(event.locals.talent.niveau);

    // Onboarding guard: redirect until every step of the canonical ladder is
    // done. `getOnboardingStep` is the single source of truth shared with the
    // wizard's resume logic and the admin progress label — so a step added there
    // is gated here automatically, with no parallel field list to keep in sync.
    if (event.locals.talent && walksOnboarding) {
      const needsOnboarding =
        getOnboardingStep(
          onboardingFieldsForYear(event.locals.talent, currentYear),
        ) !== null;

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

    // A talent with no dossier has no business in the wizard, whatever their
    // timestamps say. Without this they would sit on step 1 forever, since the
    // guard above no longer advances them.
    if (
      event.locals.talent &&
      !walksOnboarding &&
      currentPath.startsWith(pathTalentOnboarding)
    ) {
      return Response.redirect(new URL(pathTalentRoot, event.url).href, 303);
    }

    // Charter guard. The RGPD charte conditions any use of Jump, and it is due
    // whatever the talent's level: their data is processed either way.
    //
    // For a talent who walks the ladder it is signed in the same transaction as
    // `rulesSignedAt`, so missing it means onboarding is unfinished and the
    // guard above already caught them; this stays a defensive net. For everyone
    // else it is the only gate they meet, and `/charte` is where they meet it -
    // the standalone page exists precisely because the wizard, which they never
    // enter, is otherwise the sole place the charte is signed.
    if (
      event.locals.talent &&
      !event.locals.talent.charterAcceptedAt &&
      !currentPath.startsWith(pathTalentOnboarding) &&
      currentPath !== pathTalentCharte &&
      currentPath !== pathTalentWelcome &&
      currentPath !== pathTalentLogin
    ) {
      return Response.redirect(
        new URL(
          walksOnboarding ? pathTalentOnboarding : pathTalentCharte,
          event.url,
        ).href,
        303,
      );
    }

    // Settled charte, no ladder to walk: nothing left on /charte.
    if (
      event.locals.talent &&
      event.locals.talent.charterAcceptedAt &&
      currentPath === pathTalentCharte
    ) {
      return Response.redirect(new URL(pathTalentRoot, event.url).href, 303);
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
      // Through the shared fragment rather than an inlined `OR`: this guard is
      // what decides whether a guardian is asked for anything, so the admin
      // directory's "parent en attente" chip and the relance audience have to
      // mean exactly what it means. Three hand-written copies of the rule is how
      // they drifted.
      const pendingCount = await prisma.talent.count({
        where: {
          parentEmail: event.locals.user.email,
          ...parentBlockedWhere,
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

/**
 * Gate on an admin session. Throws 403 otherwise.
 *
 * `applyRouteGuards` already bounces non-admins off `/staff/admin/*`, but it
 * deliberately skips `/api/*` (those routes authenticate themselves) and it
 * cannot cover an action-only route posted to directly. This is the one spelling
 * for "the caller must be an admin", so the admin endpoints and dialog-backing
 * actions stop each inlining their own `staffRole !== 'admin'` check.
 *
 * Not a `STAFF_GROUPS` entry: a group named after this gate would only
 * re-encode `staffRole === 'admin'`, and `realSendArmers` (the existing
 * admin-shaped group) is about arming outbound sends, not about being an admin.
 */
export function requireAdminSession(
  locals: App.Locals,
): asserts locals is App.Locals & {
  staffProfile: NonNullable<App.Locals['staffProfile']> & {
    staffRole: 'admin';
  };
} {
  if (locals.staffProfile?.staffRole === 'admin') return;
  // No `code`: the admin gate has no "contact your superdev" nuance to pass to
  // `(staff)/+error.svelte`, so its generic 403 copy is the right one. Adding a
  // second gating code would only give the error page a branch that says less.
  throw error(403, 'Action réservée.');
}
