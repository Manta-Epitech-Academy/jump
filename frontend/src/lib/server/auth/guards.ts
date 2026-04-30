import { error, type RequestEvent } from '@sveltejs/kit';
import { resolve as resolvePath } from '$app/paths';
import type { StaffRole } from '@prisma/client';
import { getStaffRoleRedirectPath } from '$lib/domain/staff';
import { prisma } from '$lib/server/db';
import { can, type StaffGroup } from '$lib/domain/permissions';
import type { FlagKey } from '$lib/domain/featureFlags';

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
  const pathPublicShowcase = p('/p/');
  const pathApi = p('/api/');
  const pathStaffDev = p('/staff/dev');
  const pathStaffPedago = p('/staff/pedago');

  const pathParentLogin = p('/parent/login');
  const pathParentRoot = p('/parent');
  const pathParentSignature = p('/parent/signature');

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
    currentPath.startsWith(pathLogout) ||
    currentPath.startsWith(pathPublicShowcase) ||
    currentPath.startsWith(pathApi);

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

    // Charter guard (onboarding sets charterAcceptedAt on completion)
    if (
      event.locals.talent &&
      !event.locals.talent.charterAcceptedAt &&
      currentPath !== pathTalentCharter &&
      !currentPath.startsWith(pathTalentOnboarding) &&
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

    // Dev sub-guard: only superdev or dev
    if (isDevPath) {
      const role = event.locals.staffProfile?.staffRole;
      if (role !== 'superdev' && role !== 'dev') {
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
    const isParentPublic = currentPath === pathParentLogin;

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
      return Response.redirect(new URL(pathParentRoot, event.url).href, 303);
    }

    // Image rights guard: block dashboard until all children have signed
    if (
      event.locals.user?.role === 'parent' &&
      !isParentPublic &&
      currentPath !== pathParentSignature
    ) {
      const unsignedCount = await prisma.talent.count({
        where: {
          parentEmail: event.locals.user.email,
          imageRightsSignedAt: null,
        },
      });
      if (unsignedCount > 0) {
        return Response.redirect(
          new URL(pathParentSignature, event.url).href,
          303,
        );
      }
    }

    // Already signed all: prevent going back to signature page
    if (
      event.locals.user?.role === 'parent' &&
      currentPath === pathParentSignature
    ) {
      const unsignedCount = await prisma.talent.count({
        where: {
          parentEmail: event.locals.user.email,
          imageRightsSignedAt: null,
        },
      });
      if (unsignedCount === 0) {
        return Response.redirect(new URL(pathParentRoot, event.url).href, 303);
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
