import { error, type RequestEvent } from '@sveltejs/kit';
import { resolve as resolvePath } from '$app/paths';
import type { StaffRole } from '@prisma/client';
import { getStaffRoleRedirectPath } from '$lib/domain/staff';
import { prisma } from '$lib/server/db';
import { can, type StaffGroup } from '$lib/domain/permissions';
import type { FlagKey } from '$lib/domain/featureFlags';
import { getOnboardingStep } from '$lib/domain/talentOnboarding';

function forbidGroup(group: StaffGroup): never {
  throw error(403, {
    message: 'Action réservée.',
    code: 'staff_group_required',
    group,
  });
}

export function hasFlag(locals: App.Locals, key: FlagKey): boolean {
  return locals.featureFlags.has(key);
}

export function requireFlag(locals: App.Locals, key: FlagKey): void {
  if (!hasFlag(locals, key)) {
    throw error(404, 'Fonctionnalité non disponible sur ce campus.');
  }
}

type StaffRoleGate = {
  pattern: RegExp;
  group: StaffGroup;
  readOnlyForRest?: readonly StaffRole[];
};

// Single source of truth for the dev-space carve-out that lets peda reach
// the interviews route. Used by hooks (`applyRouteGuards` dev sub-guard),
// the `/staff/dev/` layout gate, and `STAFF_ROLE_GATES` below.
export const DEV_INTERVIEWS_PATH_PATTERN =
  /^\/staff\/dev\/events\/[^/]+\/interviews(?:\/|$)/;

const STAFF_ROLE_GATES: readonly StaffRoleGate[] = [
  {
    pattern: /^\/staff\/dev\/events\/import(?:\/|$)/,
    group: 'devLead',
  },
  {
    pattern: /^\/staff\/dev\/team(?:\/|$)/,
    group: 'devLead',
  },
  {
    pattern: DEV_INTERVIEWS_PATH_PATTERN,
    group: 'interviewers',
  },
  {
    pattern: /^\/staff\/pedago\/events\/[^/]+\/planning(?:\/|$)/,
    group: 'pedaLead',
    readOnlyForRest: ['manta'],
  },
  {
    pattern: /^\/staff\/pedago\/events\/[^/]+\/factions(?:\/|$)/,
    group: 'pedaLead',
  },
  {
    pattern: /^\/staff\/dev\/contenu(?:\/|$)/,
    group: 'devMember',
  },
  {
    pattern: /^\/staff\/pedago\/contenu(?:\/|$)/,
    group: 'pedaMember',
  },
];

export async function applyRouteGuards(
  event: RequestEvent,
): Promise<Response | null> {
  const currentPath = event.url.pathname;
  const routeId = event.route.id || '';

  event.locals.viewMode = 'edit';

  const p = (path: string) =>
    new URL(resolvePath(path as any), event.url).pathname;

  const pathStaffLogin = p('/staff/login');
  const pathStaffOAuth = p('/staff/oauth');
  const pathStaffAdmin = p('/staff/admin');
  const pathTalentLogin = p('/login');
  const pathTalentRoot = p('/');
  const pathTalentCharter = p('/charter');
  const pathTalentOnboarding = p('/onboarding');
  const pathTalentOAuth = p('/oauth');
  const pathLogout = p('/logout');
  const pathApi = p('/api/');
  const pathStaffDev = p('/staff/dev');
  const pathStaffPedago = p('/staff/pedago');

  const pathTalentWelcome = p('/welcome');
  const pathParentLogin = p('/parent/login');
  const pathParentFastlogin = p('/parent/fastlogin');
  const pathParentWelcome = p('/parent/welcome');
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
  const isPedagoPath =
    currentPath === pathStaffPedago ||
    currentPath.startsWith(`${pathStaffPedago}/`);

  const isPublicPath =
    currentPath.startsWith(pathLogout) || currentPath.startsWith(pathApi);

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

    // Welcome guard: redirect to /welcome BEFORE onboarding (first visit only).
    // The staff message gets read in full, then markSeen hands off to
    // onboarding. Once seen, this short-circuits before the query below.
    if (
      event.locals.talent &&
      !event.locals.talent.welcomeSeenAt &&
      currentPath !== pathTalentWelcome &&
      !currentPath.startsWith(pathTalentOnboarding) &&
      currentPath !== pathTalentLogin
    ) {
      const stageParticipation = await prisma.participation.findFirst({
        where: {
          talentId: event.locals.talent.id,
          event: { eventType: 'stage_seconde' },
        },
        orderBy: { event: { date: 'desc' } },
        select: { event: { select: { id: true, endDate: true, date: true } } },
      });
      if (stageParticipation) {
        const stageEnd =
          stageParticipation.event.endDate ?? stageParticipation.event.date;
        if (stageEnd >= new Date()) {
          const welcomePage = await prisma.cmsPage.findUnique({
            where: {
              slug_eventId: {
                slug: 'welcome',
                eventId: stageParticipation.event.id,
              },
            },
          });
          if (welcomePage?.content) {
            return Response.redirect(
              new URL(pathTalentWelcome, event.url).href,
              303,
            );
          }
        }
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
          new URL(pathTalentOnboarding, event.url).href,
          303,
        );
      }

      // Already completed: prevent going back to onboarding
      if (!needsOnboarding && currentPath.startsWith(pathTalentOnboarding)) {
        return Response.redirect(new URL(pathTalentRoot, event.url).href, 303);
      }
    }

    // Charter guard (onboarding sets charterAcceptedAt on completion)
    if (
      event.locals.talent &&
      !event.locals.talent.charterAcceptedAt &&
      currentPath !== pathTalentCharter &&
      !currentPath.startsWith(pathTalentOnboarding) &&
      currentPath !== pathTalentWelcome &&
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
      currentPath === pathStaffLogin || currentPath.startsWith(pathStaffOAuth);

    if (!isStaffPublic && !event.locals.user) {
      return Response.redirect(new URL(pathStaffLogin, event.url).href, 303);
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

    // Dev sub-guard: only superdev or dev. Carve-out: any role in the
    // `interviewers` group can reach the interviews route on any event so
    // they can fill the grid for interviews they were assigned. The
    // `interviewers` STAFF_ROLE_GATES entry below narrows it further; the
    // wider /staff/dev/* shell stays dev-only.
    if (isDevPath) {
      const role = event.locals.staffProfile?.staffRole;
      const isInterviewsPath = DEV_INTERVIEWS_PATH_PATTERN.test(currentPath);
      const allowed =
        role === 'superdev' ||
        role === 'dev' ||
        (isInterviewsPath && can('interviewers', role));
      if (!allowed) {
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

    // Pedago sub-guard: only peda or manta
    if (isPedagoPath) {
      const role = event.locals.staffProfile?.staffRole;
      if (role !== 'peda' && role !== 'manta') {
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

    // Per-feature sub-role gates run from (staff)/+layout.server.ts via
    // applyStaffRoleGate — errors thrown in handle bypass +error.svelte.
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

    // Parent flow: welcome → signature → merci
    // Authenticated parents who haven't signed yet go through welcome → signature.
    // Once all children are signed, they land on /parent/merci (no dashboard in this release).
    if (event.locals.user?.role === 'parent' && !isParentPublic) {
      const unsignedCount = await prisma.talent.count({
        where: {
          parentEmail: event.locals.user.email,
          imageRightsSignedAt: null,
        },
      });

      if (unsignedCount > 0) {
        // Still need to sign — only allow welcome and signature pages
        if (
          currentPath !== pathParentWelcome &&
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

export function applyStaffRoleGate(locals: App.Locals, pathname: string): void {
  const role = locals.staffProfile?.staffRole;
  if (!role) return;

  for (const gate of STAFF_ROLE_GATES) {
    if (!gate.pattern.test(pathname)) continue;
    if (can(gate.group, role)) {
      locals.viewMode = 'edit';
      return;
    }
    if (gate.readOnlyForRest?.includes(role)) {
      locals.viewMode = 'readonly';
      return;
    }
    forbidGroup(gate.group);
  }
}

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
 * Allow either devMember (admissions team owns the workflow) OR the staff
 * the interview was assigned to (so a pédago who was assigned an interview
 * can fill its evaluation grid and close it out themselves).
 *
 * The null-role check up front is what makes the `staffRole: StaffRole`
 * narrowing sound: without it, an unrolled staff whose `id` happens to
 * match `interview.staffId` would slip through and the assertion would
 * lie to callers.
 */
export function requireInterviewActor(
  locals: App.Locals,
  interview: { staffId: string },
): asserts locals is App.Locals & {
  staffProfile: NonNullable<App.Locals['staffProfile']> & {
    staffRole: StaffRole;
  };
} {
  const profile = locals.staffProfile;
  if (!profile || !profile.staffRole) forbidGroup('interviewers');
  if (can('devMember', profile.staffRole)) return;
  if (interview.staffId === profile.id) return;
  forbidGroup('interviewers');
}
