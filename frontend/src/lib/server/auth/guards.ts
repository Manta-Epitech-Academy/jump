import { error, type RequestEvent } from '@sveltejs/kit';
import { resolve as resolvePath } from '$app/paths';
import type { StaffRole, Talent } from '@prisma/client';
import { getStaffRoleRedirectPath } from '#lib/domain/staff.ts';
import { prisma } from '#lib/server/db.ts';
import { can, type StaffGroup } from '#lib/domain/permissions.ts';
import {
  getOnboardingStep,
  onboardingFieldsForYear,
} from '#lib/domain/talentOnboarding.ts';
import { currentSchoolYearLabel } from '#lib/domain/schoolYear.ts';
import { isOnboardingEligible } from '#lib/domain/niveau.ts';
import { parentBlockedWhere } from '#lib/server/db/dossierCompliance.ts';
import { impersonatedBy } from '#lib/domain/impersonation.ts';
import {
  loginUrlWithRedirect,
  onboardingFunnelUrl,
} from '#lib/server/auth/loginRedirect.ts';

/**
 * Where a talent stands against the gates in front of the app, read once so the
 * route guards and the remote-function gate (`admitCaller`) cannot disagree.
 */
export type TalentStanding = {
  /**
   * Whether the talent walks the onboarding ladder at all. Collégiens do not:
   * the seminar settled that Jump holds no reliable guardian contact for them,
   * so they reach the app without a dossier. Kept out of `getOnboardingStep`,
   * whose contract is that the step is a pure function of the timestamps set;
   * eligibility is a property of the talent's level, layered on top here.
   */
  walksOnboarding: boolean;
  /**
   * Whether this school year's dossier still has a step to do.
   * `getOnboardingStep` is the single source of truth shared with the wizard's
   * resume logic and the admin progress label, so a step added there is gated
   * here automatically, with no parallel field list to keep in sync. The flat
   * columns on `Talent` hold the most recent dossier, which for a talent
   * returning after the summer is last year's; `onboardingFieldsForYear` reads
   * them as "nothing done" unless they are this year's, so a returning talent
   * is sent back through the wizard instead of walking in on last year's
   * signature.
   */
  dossierOpen: boolean;
  /**
   * Whether the welcome splash is still due: never seen, with this year's
   * dossier still open. It is due to a collégien too, whose dossier never
   * closes: the splash is where every talent starts, ladder or not.
   */
  owesWelcome: boolean;
  /**
   * Whether the app is open to them: the welcome splash seen, the RGPD charte
   * signed, and the dossier done for a talent who walks the ladder. Everything
   * outside the welcome splash, the wizard and `/charte` waits on this.
   */
  appOpen: boolean;
};

export function talentStanding(talent: Talent): TalentStanding {
  const walksOnboarding = isOnboardingEligible(talent.niveau);
  const dossierOpen =
    getOnboardingStep(
      onboardingFieldsForYear(talent, currentSchoolYearLabel()),
    ) !== null;
  const owesWelcome = talent.welcomeSeenAt == null && dossierOpen;
  return {
    walksOnboarding,
    dossierOpen,
    owesWelcome,
    appOpen:
      talent.charterAcceptedAt != null &&
      !owesWelcome &&
      !(walksOnboarding && dossierOpen),
  };
}

/**
 * Who may call a remote function (`#lib/server/remoteFunctions.ts`).
 *
 * The route guards cannot answer it. They read `event.route.id`, and a remote
 * call has none to read: a `query` arrives on `/_app/remote/…` with no route at
 * all, so `applyRouteGuards` lets it through as a 404 it never is, and a
 * `command` names the page it came from in `x-sveltekit-pathname`, a header the
 * caller writes. Either way the function's own gate is the only one.
 *
 * - `{ admin: true }`: an admin session, as `requireAdminSession`.
 * - `{ staff: group }`: a staff role in the group, as `requireStaffGroup`.
 * - `{ talent: 'appOpen' }`: a talent the app is open to (`talentStanding`):
 *   what every talent page past the welcome splash, the wizard and `/charte`
 *   asks for, the RGPD charte included.
 * - `{ talent: 'signedIn' }`: any talent session, the wizard's included. Only
 *   for what the wizard itself needs, and nothing that reads the talent's data
 *   before the charte is signed.
 */
export type RemoteGate =
  { admin: true } | { staff: StaffGroup } | { talent: 'appOpen' | 'signedIn' };

type StaffCaller = {
  locals: App.Locals;
  staffProfile: NonNullable<App.Locals['staffProfile']> & {
    staffRole: StaffRole;
  };
};

type TalentCaller = {
  locals: App.Locals;
  talent: NonNullable<App.Locals['talent']>;
  /**
   * An admin is looking through the talent's session. What the talent sees
   * then is the admin's preview: a write that only records that the talent
   * saw something (a celebration played) skips on it, so the talent still
   * gets it on their own next visit.
   */
  impersonated: boolean;
};

/** What a remote function learns about who called it, by gate. */
export type RemoteCaller<G extends RemoteGate> = G extends { talent: string }
  ? TalentCaller
  : StaffCaller;

/**
 * Admit the caller through `gate` or throw: 401 without the session the gate
 * names, 403 with one that falls short of it.
 */
export function admitCaller<G extends RemoteGate>(
  gate: G,
  locals: App.Locals,
): RemoteCaller<G> {
  if ('talent' in gate) {
    const talent = locals.talent;
    if (!talent) throw error(401, 'Connexion requise.');
    if (gate.talent === 'appOpen' && !talentStanding(talent).appOpen) {
      throw error(403, 'Termine ton inscription pour continuer.');
    }
    return {
      locals,
      talent,
      impersonated: impersonatedBy(locals.session) !== null,
    } as RemoteCaller<G>;
  }
  if (!locals.staffProfile) throw error(401, 'Connexion requise.');
  if ('admin' in gate) requireAdminSession(locals);
  else requireStaffGroup(locals, gate.staff);
  return { locals, staffProfile: locals.staffProfile } as RemoteCaller<G>;
}

function forbidGroup(group: StaffGroup): never {
  throw error(403, 'Action réservée.', {
    code: 'staff_group_required',
    group,
  });
}

/**
 * A 303 to `location`, resolved against the request. Built rather than taken
 * from `Response.redirect`, whose headers the Fetch standard freezes: the hook
 * stamps its security headers on every guard answer, which throws `immutable`
 * on a runtime that enforces the standard (Node, so Vitest) and only ever
 * passed because Bun, which runs Jump, does not.
 */
function seeOther(location: string, base: URL): Response {
  return new Response(null, {
    status: 303,
    headers: { location: new URL(location, base).href },
  });
}

export async function applyRouteGuards(
  event: RequestEvent,
): Promise<Response | null> {
  const routeId = event.route.id || '';

  // Where to send someone: root-relative pathnames, resolved against the base
  // path (`paths.relative` is off, so `resolve()` never answers `../x`).

  const pathStaffLogin = resolvePath('staff/login');
  const pathTalentLogin = resolvePath('login');
  const pathTalentRoot = resolvePath('');
  const pathTalentOnboarding = resolvePath('onboarding');
  const pathTalentWelcome = resolvePath('welcome');
  const pathTalentCharte = resolvePath('charte');
  const pathParentLogin = resolvePath('login');
  const pathParentWelcome = resolvePath('parent/welcome');
  const pathParentMerci = resolvePath('parent/merci');

  // Where someone is: the matched route, never event.url.pathname. The router
  // matches on the decoded path while url.pathname keeps its percent-encoding,
  // so a pathname compare lets `/staff/%61dmin/*` resolve to the admin route
  // while reading as non-admin, or `/%6Fnboarding` reach the wizard's actions
  // while reading as off it, and skip the guard that was about that route
  // (security audit run-1). A request no route matches has no id, and nothing
  // below concerns it: it is a 404.
  const on = (id: string) => routeId === id;
  const within = (id: string) => on(id) || routeId.startsWith(`${id}/`);

  const isTalentRoute = within('/(talent)');
  const isStaffRoute = within('/(staff)');
  const isParentRoute = within('/(parent)');
  const isAdminPath = within('/(staff)/staff/admin');
  const isDevPath = within('/(staff)/staff/dev');

  const onTalentLogin = on('/(talent)/login');
  const onTalentWelcome = on('/(talent)/welcome');
  const onTalentCharte = on('/(talent)/charte');
  const onTalentOnboarding = within('/(talent)/onboarding');

  // --- Talent Guards ---
  if (isTalentRoute) {
    if (!event.locals.talent && !onTalentLogin) {
      return seeOther(
        loginUrlWithRedirect(pathTalentLogin, event.url),
        event.url,
      );
    }
    if (event.locals.talent && onTalentLogin) {
      return seeOther(pathTalentRoot, event.url);
    }

    const standing = event.locals.talent
      ? talentStanding(event.locals.talent)
      : null;
    const walksOnboarding = standing?.walksOnboarding ?? false;

    // Welcome guard: a fresh talent sees the welcome splash once, before
    // onboarding. `markSeen` sets `welcomeSeenAt` and hands off to onboarding, so
    // this short-circuits on every later request. Gated purely on talent state
    // (never seen it AND still has onboarding to do), not on any event: the
    // splash copy is generic and owned by the page. The CMS `welcome` row feeds
    // only the dashboard's Actualité card, a separate surface.
    if (
      standing?.owesWelcome &&
      !onTalentWelcome &&
      !onTalentOnboarding &&
      !onTalentLogin
    ) {
      return seeOther(
        onboardingFunnelUrl(pathTalentWelcome, event.url),
        event.url,
      );
    }

    // Onboarding guard: redirect until every step of the canonical ladder is
    // done.
    if (event.locals.talent && walksOnboarding) {
      const needsOnboarding = standing?.dossierOpen ?? false;

      if (
        needsOnboarding &&
        !onTalentOnboarding &&
        !onTalentWelcome &&
        !onTalentLogin
      ) {
        return seeOther(
          onboardingFunnelUrl(pathTalentOnboarding, event.url),
          event.url,
        );
      }

      // Already completed: prevent going back to onboarding
      if (!needsOnboarding && onTalentOnboarding) {
        return seeOther(pathTalentRoot, event.url);
      }
    }

    // A talent with no dossier has no business in the wizard, whatever their
    // timestamps say. Without this they would sit on step 1 forever, since the
    // guard above no longer advances them.
    if (event.locals.talent && !walksOnboarding && onTalentOnboarding) {
      return seeOther(pathTalentRoot, event.url);
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
      !onTalentOnboarding &&
      !onTalentCharte &&
      !onTalentWelcome &&
      !onTalentLogin
    ) {
      return seeOther(
        walksOnboarding ? pathTalentOnboarding : pathTalentCharte,
        event.url,
      );
    }

    // Settled charte, no ladder to walk: nothing left on /charte.
    if (
      event.locals.talent &&
      event.locals.talent.charterAcceptedAt &&
      onTalentCharte
    ) {
      return seeOther(pathTalentRoot, event.url);
    }
  }

  // --- Staff Guards ---
  if (isStaffRoute) {
    const isStaffPublic =
      on('/(staff)/staff/login') || within('/(staff)/staff/oauth');

    if (!isStaffPublic && !event.locals.user) {
      return seeOther(
        loginUrlWithRedirect(pathStaffLogin, event.url),
        event.url,
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
      return seeOther(pathTalentRoot, event.url);
    }

    // Admin sub-guard
    if (isAdminPath) {
      if (event.locals.staffProfile?.staffRole !== 'admin') {
        return seeOther(pathStaffLogin, event.url);
      }
    }

    // Dev sub-guard: only the dev workspace's members.
    if (isDevPath) {
      const role = event.locals.staffProfile?.staffRole;
      if (!can('devMember', role)) {
        const correctPath = getStaffRoleRedirectPath(role);
        if (correctPath) {
          return seeOther(resolvePath(correctPath), event.url);
        }
        return seeOther(`${pathStaffLogin}?error=NoRole`, event.url);
      }
    }
  }

  // --- Parent Guards ---
  if (isParentRoute) {
    // `/parent/fastlogin` forges the session itself (magic-link token), so it
    // must be reachable without one: same exemption as `/parent/login`.
    // Without this the guard bounces the unauthenticated clicker to login and
    // the endpoint never runs.
    const isParentPublic =
      on('/(parent)/parent/login') || on('/(parent)/parent/fastlogin');

    if (
      !isParentPublic &&
      (!event.locals.user || event.locals.user.role !== 'parent')
    ) {
      return seeOther(pathParentLogin, event.url);
    }
    if (event.locals.user?.role === 'parent' && on('/(parent)/parent/login')) {
      return seeOther(pathParentWelcome, event.url);
    }

    // Parent flow: welcome → règlement → droit-image → merci
    // The guardian has two legal acts per child: co-signing the règlement
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
          !on('/(parent)/parent/welcome') &&
          !on('/(parent)/parent/reglement') &&
          !on('/(parent)/parent/signature')
        ) {
          return seeOther(pathParentWelcome, event.url);
        }
      } else {
        // All signed: always land on merci (no dashboard in this release)
        if (!on('/(parent)/parent/merci')) {
          return seeOther(pathParentMerci, event.url);
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

/**
 * Gate on a guardian's session. Throws 401 otherwise.
 *
 * `applyRouteGuards` already sends anybody else from `/parent/*` to the parent
 * login, so this is the narrowing every parent load and action needs on
 * `locals.user` more than a second gate: one spelling of it instead of a
 * `role !== 'parent'` check written into each page. It also covers an action
 * posted to directly, which reaches the same route guard but is the place a
 * signature is written.
 */
export function requireParentSession(
  locals: App.Locals,
): asserts locals is App.Locals & {
  user: NonNullable<App.Locals['user']> & { role: 'parent' };
} {
  if (locals.user?.role === 'parent') return;
  throw error(401, 'Non autorisé');
}
