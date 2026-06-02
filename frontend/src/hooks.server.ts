import type { Handle } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { prisma } from '$lib/server/db';
import { applyRouteGuards } from '$lib/server/auth/guards';
import { markRecipientOpened } from '$lib/server/services/broadcast/tracking';
import { resolveEffectiveFlags } from '$lib/domain/featureFlags';
import { resolveTalentCampus } from '$lib/server/services/talentCampus';
import { getTicketsEnabled } from '$lib/server/settings/tickets';
import { readDevPhaseOverride } from '$lib/server/devPhaseOverride';
import { runWithRequestContext } from '$lib/server/requestContext';
import { readArmedState } from '$lib/server/armRealSends';
import { env } from '$env/dynamic/private';

const UMAMI_HOST = 'https://jump-umami.epiboost.eu';

// Crisp live-chat (talent space). Hosts whitelisted unconditionally; the widget
// only actually loads when PUBLIC_CRISP_WEBSITE_ID is set (see Crisp.svelte).
const CRISP_HOST = 'https://client.crisp.chat';
const CRISP_RELAY = 'wss://client.relay.crisp.chat';

// Allow the configured jump-games origin to be embedded as an iframe. Deployed
// hosts already match the `*.epiboost.eu` wildcard below, but a local
// jump-games (e.g. http://localhost:5174) does not — derive its origin so
// frame-src follows JUMP_GAMES_URL in every environment.
const GAMES_FRAME_SRC = (() => {
  try {
    return env.JUMP_GAMES_URL ? new URL(env.JUMP_GAMES_URL).origin : '';
  } catch {
    return '';
  }
})();

// Built manually rather than via `kit.csp` because SvelteKit's auto-CSP
// injects a per-request nonce in `script-src`, which makes browsers ignore
// `'unsafe-inline'`. The Umami session-replay recorder needs to evaluate
// ad-hoc inline scripts and `on*` attribute handlers we cannot pre-hash,
// so `'unsafe-inline'` must actually take effect here.
const CSP_HEADER = [
  "default-src 'self'",
  `script-src 'self' ${UMAMI_HOST} ${CRISP_HOST} 'unsafe-inline' 'unsafe-hashes'`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com ${CRISP_HOST}`,
  "img-src 'self' data: https:",
  `font-src 'self' https://fonts.gstatic.com ${CRISP_HOST}`,
  `connect-src 'self' https://discord.com ${UMAMI_HOST} ${CRISP_HOST} ${CRISP_RELAY}`,
  "frame-ancestors 'none'",
  `frame-src 'self' https://*.epiboost.eu https://*.epiboost.fr${GAMES_FRAME_SRC ? ` ${GAMES_FRAME_SRC}` : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function setSecurityHeaders(response: Response) {
  response.headers.set('Content-Security-Policy', CSP_HEADER);
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
  event.locals.featureFlags = new Set();
  event.locals.ticketsEnabled = false;
  event.locals.stagePhaseOverride = null;
  event.locals.impersonator = null;
  event.locals.talentCampusName = null;
  event.locals.armedRealSends = false;
  event.locals.armedRealSendsUntil = null;

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

    let campusId = event.locals.staffProfile?.campusId ?? null;
    if (!campusId && event.locals.talent) {
      // Talents have no direct Campus relation; their effective campus is the
      // one from their most recent participation. Resolve it once here and reuse
      // for both feature-flag scoping (campusId) and analytics (talentCampusName)
      // so the root layout doesn't have to re-run the same lookup. Shared with
      // onboarding's early-bird scope via resolveTalentCampus.
      const talentCampus = await resolveTalentCampus(
        prisma,
        event.locals.talent.id,
      );
      campusId = talentCampus.campusId;
      event.locals.talentCampusName = talentCampus.campusName;
    }
    if (campusId) {
      const overrides = await prisma.campusFeatureFlag.findMany({
        where: { campusId },
        select: { flagKey: true, enabled: true },
      });
      event.locals.featureFlags = resolveEffectiveFlags(overrides);
    }

    if (event.locals.staffProfile) {
      event.locals.ticketsEnabled = await getTicketsEnabled();
    }

    // Resolve the real admin behind an impersonated session so analytics can
    // attribute actions to the actor (not the impersonated user). BetterAuth
    // stores the admin's user id in `session.impersonatedBy`.
    const impersonatedById =
      (event.locals.session as { impersonatedBy?: string | null } | null)
        ?.impersonatedBy ?? null;
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

    // 2.5 Update lastActiveAt for students (throttled to once per day, fire-and-forget)
    if (event.locals.talent) {
      const now = new Date();
      const lastActive = event.locals.talent.lastActiveAt;
      if (
        !lastActive ||
        now.getTime() - lastActive.getTime() > 1000 * 60 * 60 * 24
      ) {
        prisma.talent
          .update({
            where: { id: event.locals.talent.id },
            data: { lastActiveAt: now },
          })
          .catch((e) =>
            console.warn('[lastActiveAt] update failed:', e.message),
          );
        event.locals.talent.lastActiveAt = now;
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
  const response = await runWithRequestContext(
    {
      actorEmail:
        event.locals.impersonator?.email ?? event.locals.user?.email ?? null,
      devRedirectEmails: actingStaff?.devRedirectEmails ?? [],
      devRedirectPhones: actingStaff?.devRedirectPhones ?? [],
      armedRealSends: armed.armed,
    },
    () => resolve(event),
  );
  setSecurityHeaders(response);

  return response;
};
