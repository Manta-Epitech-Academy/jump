import type { Handle } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { prisma } from '$lib/server/db';
import { applyRouteGuards } from '$lib/server/auth/guards';
import { resolveEffectiveFlags } from '$lib/domain/featureFlags';
import { getTicketsEnabled } from '$lib/server/settings/tickets';
import { readDevPhaseOverride } from '$lib/server/devPhaseOverride';

const UMAMI_HOST = 'https://jump-umami.epiboost.eu';

// Built manually rather than via `kit.csp` because SvelteKit's auto-CSP
// injects a per-request nonce in `script-src`, which makes browsers ignore
// `'unsafe-inline'`. The Umami session-replay recorder needs to evaluate
// ad-hoc inline scripts and `on*` attribute handlers we cannot pre-hash,
// so `'unsafe-inline'` must actually take effect here.
const CSP_HEADER = [
  "default-src 'self'",
  `script-src 'self' ${UMAMI_HOST} 'unsafe-inline' 'unsafe-hashes'`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: https:",
  "font-src 'self' https://fonts.gstatic.com",
  `connect-src 'self' https://discord.com ${UMAMI_HOST}`,
  "frame-ancestors 'none'",
  "frame-src 'self' https://*.epiboost.eu https://*.epiboost.fr",
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
  // Fire-and-forget. `updateMany` silently no-ops if the id is unknown.
  // `openedAt: null` in the filter makes the first hit win, idempotent
  // on subsequent clicks.
  prisma.broadcastRecipient
    .updateMany({
      where: { id: trackingId, openedAt: null },
      data: { openedAt: new Date() },
    })
    .catch(() => {});
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
      // so the root layout doesn't have to re-run the same lookup.
      const participation = await prisma.participation.findFirst({
        where: { talentId: event.locals.talent.id },
        orderBy: { event: { date: 'desc' } },
        select: { campusId: true, campus: { select: { name: true } } },
      });
      campusId = participation?.campusId ?? null;
      event.locals.talentCampusName = participation?.campus?.name ?? null;
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
          .catch(() => {});
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

  const response = await resolve(event);
  setSecurityHeaders(response);

  return response;
};
