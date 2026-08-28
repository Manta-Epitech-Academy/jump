import type { Handle } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { prisma } from '$lib/server/db';
import { applyRouteGuards } from '$lib/server/auth/guards';
import { slideImpersonationExpiry } from '$lib/server/auth/impersonation';
import { markRecipientOpened } from '$lib/server/services/broadcast/tracking';
import { resolveTalentCampus } from '$lib/server/services/talentCampus';
import { readDevPhaseOverride } from '$lib/server/devPhaseOverride';
import { readPlanningPreview } from '$lib/server/talentPlanningPreview';
import { runWithRequestContext } from '$lib/server/requestContext';
import { readArmedState, effectiveUserId } from '$lib/server/armRealSends';
import { readDevRedirectPin } from '$lib/server/devRedirectPin';
import { staffBulkDevRedirectEmails } from '$lib/server/email/dev-redirect';
import { env } from '$env/dynamic/private';

// Every other CSP directive is a fixed constant (or gone with the recorder,
// issue #275) and lives in `kit.csp` (svelte.config.js) now, which hands out a
// real per-request script-src nonce instead of `'unsafe-inline'`. `frame-src`
// is the one exception: its `JUMP_GAMES_URL`-derived entry is genuinely
// per-deployment, and svelte.config.js only ever runs at build time (see the
// Dockerfile — one image, built before any environment's env vars exist, then
// deployed everywhere with different ones), so it has to stay here and be
// appended onto the header kit.csp already set. Deployed games hosts already
// match the `*.epiboost.eu` wildcard below; only a local jump-games (e.g.
// http://localhost:5174) needs the extra entry.
const GAMES_FRAME_SRC = (() => {
  try {
    return env.JUMP_GAMES_URL ? new URL(env.JUMP_GAMES_URL).origin : '';
  } catch {
    return '';
  }
})();

const FRAME_SRC_DIRECTIVE = `frame-src 'self' https://*.epiboost.eu https://*.epiboost.fr${GAMES_FRAME_SRC ? ` ${GAMES_FRAME_SRC}` : ''}`;

// Nothing runs a script or embeds a frame on these: an early guard redirect, a
// JSON action result, a `+server.ts` endpoint. None of them go through kit's
// page renderer, so none of them carry the `kit.csp` header — refuse
// everything rather than leave the response with no policy at all.
const LOCKED_DOWN_CSP =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

function setSecurityHeaders(response: Response) {
  const renderedCsp = response.headers.get('Content-Security-Policy');
  response.headers.set(
    'Content-Security-Policy',
    renderedCsp ? `${renderedCsp}; ${FRAME_SRC_DIRECTIVE}` : LOCKED_DOWN_CSP,
  );
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains',
  );
  // Never let the browser reuse a cached HTML document without revalidating.
  // The document references content-hashed `_app/immutable` chunks; a stale
  // cached page points at hashes a later deploy has deleted -> 404 on boot.
  // (The immutable assets themselves are served by adapter-node's static
  // handler before this hook, so their long-lived caching is untouched.) Only
  // stamp pages that haven't already set their own policy, so endpoints with
  // explicit cache headers - e.g. the no-store diploma PDFs - keep theirs.
  if (
    !response.headers.has('Cache-Control') &&
    response.headers.get('Content-Type')?.includes('text/html')
  ) {
    response.headers.set('Cache-Control', 'no-cache');
  }
}

// Cuid v2 (default Prisma) is 24+ lowercase alphanumeric chars. We keep the
// shape check loose to remain forward-compatible with cuid2 / id changes,
// but tight enough to reject obvious garbage before hitting the DB.
const TRACKING_ID_RE = /^[a-z0-9]{20,40}$/i;

function recordOpenIfTracked(event: Parameters<Handle>[0]['event']) {
  const trackingId = event.url.searchParams.get('tracking_id');
  if (!trackingId || !TRACKING_ID_RE.test(trackingId)) return;
  markRecipientOpened(trackingId);
}

export const handle: Handle = async ({ event, resolve }) => {
  recordOpenIfTracked(event);

  // 1. Get session from BetterAuth
  const sessionData = await auth.api.getSession({
    headers: event.request.headers,
  });

  event.locals.user = sessionData?.user ?? null;
  event.locals.session = sessionData?.session ?? null;
  event.locals.staffProfile = null;
  event.locals.talent = null;
  event.locals.stagePhaseOverride = null;
  event.locals.planningPreview = null;
  event.locals.impersonator = null;
  event.locals.talentCampusName = null;
  event.locals.armedRealSends = false;
  event.locals.armedRealSendsUntil = null;
  event.locals.devRedirectPin = null;

  // 2. Load profiles + refresh role from DB in a single query.
  // BetterAuth caches the session payload (including role) in a cookie for 5
  // minutes, so locals.user.role can lag behind the DB after admin changes,
  // OAuth provisioning, or first login. Hydrating from bauth_user every
  // request gives every consumer a fresh role.
  if (event.locals.user) {
    const record = await prisma.bauth_user.findUnique({
      where: { id: event.locals.user.id },
      select: {
        role: true,
        name: true,
        image: true,
        staffProfile: { include: { campus: true } },
        // Staff notes about a talent live in their own table (`Note_TalentNote`),
        // never on the Talent row, so there is nothing staff-only to strip from
        // `locals.talent` here — the leak the old `note` column had to omit is
        // structurally gone.
        talent: true,
      },
    });

    if (record) {
      event.locals.user.role = record.role;
      event.locals.user.name = record.name ?? event.locals.user.name;
      event.locals.user.image = record.image ?? event.locals.user.image;
      event.locals.staffProfile = record.staffProfile;
      event.locals.talent = record.talent;
    }

    if (!event.locals.staffProfile?.campusId && event.locals.talent) {
      // Talents have no direct Campus relation; their effective campus is the
      // one from their most recent participation. Resolve it here for analytics
      // (talentCampusName) so the root layout doesn't re-run the same lookup.
      // Staff carry their campus on the profile, so only talents need this.
      // Shared with onboarding's early-bird scope via resolveTalentCampus.
      const talentCampus = await resolveTalentCampus(
        prisma,
        event.locals.talent.id,
      );
      event.locals.talentCampusName = talentCampus.campusName;
    }

    // Resolve the real admin behind an impersonated session so analytics can
    // attribute actions to the actor (not the impersonated user). BetterAuth
    // stores the admin's user id in `session.impersonatedBy`.
    const impersonatedById =
      (event.locals.session as { impersonatedBy?: string | null } | null)
        ?.impersonatedBy ?? null;
    // Keep an actively-used impersonation session from hitting its hard wall:
    // slide its expiry forward so an admin testing a talent's flow is never
    // bounced to login (which would drop their own admin session too). An
    // abandoned session still lapses after the idle window. See the helper.
    if (impersonatedById && event.locals.session) {
      slideImpersonationExpiry(event.locals.session);
    }
    if (impersonatedById) {
      const adminRecord = await prisma.bauth_user.findUnique({
        where: { id: impersonatedById },
        select: {
          email: true,
          staffProfile: {
            select: {
              id: true,
              staffRole: true,
              campus: { select: { name: true } },
              devRedirectEmails: true,
              devRedirectPhones: true,
            },
          },
        },
      });
      if (adminRecord) {
        event.locals.impersonator = {
          userId: impersonatedById,
          email: adminRecord.email ?? null,
          staffProfileId: adminRecord.staffProfile?.id ?? null,
          staffRole: adminRecord.staffProfile?.staffRole ?? null,
          campusName: adminRecord.staffProfile?.campus?.name ?? null,
          devRedirectEmails: adminRecord.staffProfile?.devRedirectEmails ?? [],
          devRedirectPhones: adminRecord.staffProfile?.devRedirectPhones ?? [],
        };
      }
    }

    event.locals.stagePhaseOverride = readDevPhaseOverride(event);
    event.locals.planningPreview = readPlanningPreview(event);

    // 2.5 Stamp the talent's activity projections (fire-and-forget). Two durable
    // facts derived from this real request:
    //   - `firstLoginAt` — set once, on the first real request, never cleared.
    //     It is the durable source for "première connexion" / the cohort funnel's
    //     "connected" gate, replacing a probe of bauth_session (whose rows are
    //     deleted by logout, identity repair and account relinks, so a real
    //     login would read "Jamais" once its session vanished).
    //   - `lastActiveAt` — throttled to once per day.
    // Skip both while impersonated: the request is an admin testing the talent's
    // experience, not the talent being active. Counting it would falsely mark a
    // never-logged-in talent as connected.
    if (event.locals.talent && !impersonatedById) {
      const now = new Date();
      const talent = event.locals.talent;
      const needFirstLogin = talent.firstLoginAt == null;
      const lastActive = talent.lastActiveAt;
      const lastActiveStale =
        !lastActive ||
        now.getTime() - lastActive.getTime() > 1000 * 60 * 60 * 24;
      if (needFirstLogin || lastActiveStale) {
        prisma.talent
          .update({
            where: { id: talent.id },
            data: {
              lastActiveAt: now,
              ...(needFirstLogin ? { firstLoginAt: now } : {}),
            },
          })
          .catch((e) =>
            console.warn('[talent activity] update failed:', e.message),
          );
        talent.lastActiveAt = now;
        if (needFirstLogin) talent.firstLoginAt = now;
      }
    }
  }

  // 3. Route guards
  const guardResponse = await applyRouteGuards(event);
  if (guardResponse) {
    setSecurityHeaders(guardResponse);
    return guardResponse;
  }

  // Run the route (loads + actions) inside a request context carrying the
  // acting human's email, so the dev-redirect trap can route trapped mail to
  // whoever drove the request rather than the shared env list. Captured here,
  // after `locals.user` is hydrated; inherited by fire-and-forget sends the
  // route schedules (e.g. the onboarding parent-welcome mail).
  //
  // Prefer the impersonator: when staff impersonate a talent to test the
  // onboarding flow, the *real* human is the admin behind the session, and
  // their `@epitech.eu` address is a real mailbox — whereas the impersonated
  // talent's email is often a seeded placeholder no one can receive. So the
  // designed "experience it as a talent" path (impersonation) traps mail to
  // the tester regardless of the talent's email. The same human owns the
  // personal dev-redirect lists the trap prefers over the env fallback.
  const actingStaff = event.locals.impersonator ?? event.locals.staffProfile;
  // Armed real sends: a deliberate, signed, auto-expiring per-user override
  // that lifts the dev-redirect trap for the human's own session.
  const armed = readArmedState(event);
  event.locals.armedRealSends = armed.armed;
  event.locals.armedRealSendsUntil = armed.until;

  // Dev-redirect pin (trapped envs only). Two roles:
  //   - logged OUT: make the arming admin look like the request actor, so the
  //     OTP login mail routes to their inbox — the functional case the pin
  //     exists for (a logged-out send otherwise has no actor and falls to the
  //     shared env list). The pin can only pick a destination inside the trap,
  //     never lift it.
  //   - logged IN as the armer: cosmetic only — surface the amber confirmation
  //     banner (mirrors the real-sends banner) so the admin sees the pin is
  //     armed and can log out to test. The actor is already correct here, so
  //     we do NOT let the pin override it.
  let pinnedStaff: {
    email: string | null;
    devRedirectEmails: string[];
    devRedirectPhones: string[];
  } | null = null;
  const pin = readDevRedirectPin(event);
  if (pin) {
    const loggedOut = !event.locals.user;
    const isArmer = pin.userId === effectiveUserId(event.locals);
    if (loggedOut || isArmer) {
      const pinned = await prisma.bauth_user.findUnique({
        where: { id: pin.userId },
        select: {
          email: true,
          staffProfile: {
            select: { devRedirectEmails: true, devRedirectPhones: true },
          },
        },
      });
      if (pinned) {
        const staff = {
          email: pinned.email ?? null,
          devRedirectEmails: pinned.staffProfile?.devRedirectEmails ?? [],
          devRedirectPhones: pinned.staffProfile?.devRedirectPhones ?? [],
        };
        // Predict the destination with the same helper the live routing uses,
        // so the banner can never claim an inbox the send won't reach.
        event.locals.devRedirectPin = {
          until: pin.until,
          to: staffBulkDevRedirectEmails(staff.devRedirectEmails, staff.email),
        };
        // Override the actor only when logged out; a logged-in armer already
        // routes to themselves and must not be impersonated by their own pin.
        if (loggedOut) pinnedStaff = staff;
      }
    }
  }

  const response = await runWithRequestContext(
    {
      actorEmail:
        event.locals.impersonator?.email ??
        event.locals.user?.email ??
        pinnedStaff?.email ??
        null,
      devRedirectEmails:
        actingStaff?.devRedirectEmails ?? pinnedStaff?.devRedirectEmails ?? [],
      devRedirectPhones:
        actingStaff?.devRedirectPhones ?? pinnedStaff?.devRedirectPhones ?? [],
      armedRealSends: armed.armed,
    },
    () => resolve(event),
  );
  setSecurityHeaders(response);

  return response;
};
