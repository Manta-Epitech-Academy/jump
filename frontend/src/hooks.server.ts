import type { Handle } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { prisma } from '$lib/server/db';
import { applyRouteGuards } from '$lib/server/auth/guards';
import { resolveEffectiveFlags } from '$lib/domain/featureFlags';
import { getTicketsEnabled } from '$lib/server/settings/tickets';
import { env as publicEnv } from '$env/dynamic/public';

function setSecurityHeaders(response: Response) {
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

// SvelteKit builds the CSP at build time from svelte.config.js. To allow
// runtime-configured external hosts (e.g. Umami host injected by Kubernetes),
// we patch the existing header in-place per request — preserving the SvelteKit
// nonce and the rest of the directives.
function extendCspWithRuntimeHosts(response: Response) {
  const umamiHost = publicEnv.PUBLIC_UMAMI_HOST?.replace(/\/$/, '');
  if (!umamiHost) return;

  const extras: Record<string, string[]> = {
    'script-src': [umamiHost],
    'script-src-elem': [umamiHost],
    'connect-src': [umamiHost],
  };

  const csp = response.headers.get('content-security-policy');
  if (!csp) return;

  const seen = new Set<string>();
  const updated = csp
    .split(';')
    .map((directive) => directive.trim())
    .filter(Boolean)
    .map((directive) => {
      const spaceIdx = directive.indexOf(' ');
      const name = spaceIdx === -1 ? directive : directive.slice(0, spaceIdx);
      seen.add(name);
      const additions = extras[name];
      return additions ? `${directive} ${additions.join(' ')}` : directive;
    });

  // If a directive we care about wasn't in the original CSP, append it
  // anchored on 'self' so we don't accidentally widen the policy.
  for (const [name, additions] of Object.entries(extras)) {
    if (!seen.has(name)) {
      updated.push(`${name} 'self' ${additions.join(' ')}`);
    }
  }

  response.headers.set('content-security-policy', updated.join('; '));
}

export const handle: Handle = async ({ event, resolve }) => {
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
        staffProfile: { include: { campus: true } },
        talent: true,
      },
    });

    if (record) {
      event.locals.user.role = record.role;
      event.locals.staffProfile = record.staffProfile;
      event.locals.talent = record.talent;
    }

    const campusId = event.locals.staffProfile?.campusId;
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
  extendCspWithRuntimeHosts(response);

  return response;
};
