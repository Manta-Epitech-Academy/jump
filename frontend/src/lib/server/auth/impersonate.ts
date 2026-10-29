import type { Cookies } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { auth } from '$lib/server/auth';
import { forwardAuthCookies } from '$lib/server/auth/cookies';
import {
  ensureTalentUser,
  TalentAccountError,
} from '$lib/server/services/talentAccount';
import { getStaffRoleRedirectPath } from '$lib/domain/staff';

export type ImpersonationTarget =
  // `id` is a Talent id: a seeded talent may have no login account yet, so it is
  // bootstrapped on the fly via ensureTalentUser.
  | { kind: 'talent'; id: string }
  // `id` is a bauth_user id (a staff member always already has one).
  | { kind: 'staff'; id: string };

export type ImpersonationRefusal = 'no_email' | 'identity_conflict' | 'failed';

export type ImpersonationResult =
  { ok: true; redirect: string } | { ok: false; reason: ImpersonationRefusal };

/**
 * The single entry point for admin impersonation, shared by the talents
 * directory (log in as a student) and the users page (log in as a staff member).
 * It resolves the target to a bauth_user id (bootstrapping a seeded talent's
 * login account when needed), mints a BetterAuth impersonation session, forwards
 * the Set-Cookie headers into SvelteKit's jar, and returns where the caller
 * should land. The two call sites used to diverge (server action with manual
 * cookie forwarding vs. client admin SDK); this is now the one mechanism.
 */
export async function startImpersonation(
  target: ImpersonationTarget,
  request: Request,
  cookies: Cookies,
  adminUserId: string,
): Promise<ImpersonationResult> {
  let userId: string;
  let redirect: string;

  if (target.kind === 'talent') {
    try {
      userId = await ensureTalentUser(target.id);
    } catch (err) {
      // A talent with no Salesforce address, or one whose address is already
      // somebody else's, has no login to impersonate: two different problems
      // for the admin. Anything else is a failure of ours, and is thrown.
      if (err instanceof TalentAccountError) {
        return { ok: false, reason: err.kind };
      }
      throw err;
    }
    // Impersonated talents land wherever the talent route guards funnel them.
    redirect = '/';
  } else {
    userId = target.id;
    const profile = await prisma.staffProfile.findUnique({
      where: { userId },
      select: { staffRole: true },
    });
    const path = getStaffRoleRedirectPath(profile?.staffRole);
    if (!path) return { ok: false, reason: 'failed' };
    redirect = path;
  }

  const res = await auth.api.impersonateUser({
    body: { userId },
    headers: request.headers,
    asResponse: true,
  });
  if (!res.ok) return { ok: false, reason: 'failed' };

  // An admin has one open window at a time. `stopImpersonation` closes it on
  // an explicit exit; a window left to lapse unattended (the machine slept
  // past the idle expiry) is the one exit Jump never sees, so it is closed
  // here, when the same admin next starts one.
  await prisma.$transaction([
    closeImpersonationWindows(adminUserId),
    prisma.audit_ImpersonationEvent.create({
      data: {
        adminUserId,
        targetUserId: userId,
        targetKind: target.kind,
      },
    }),
  ]);

  forwardAuthCookies(res, cookies);
  return { ok: true, redirect };
}

/**
 * The way back from `startImpersonation`, and the only one: BetterAuth's own
 * `stop-impersonating` route is not mounted over HTTP
 * (`server/auth/httpSurface.ts`). BetterAuth deletes the impersonation session and restores
 * the admin's from its `admin_session` cookie; the Set-Cookie headers are
 * forwarded into SvelteKit's jar, and the admin's open audit window is closed
 * at the moment they leave. `adminUserId` is the session's `impersonatedBy`.
 * Returns false when BetterAuth refused, having written nothing.
 */
export async function stopImpersonation(
  request: Request,
  cookies: Cookies,
  adminUserId: string,
): Promise<boolean> {
  const res = await endImpersonation(request, adminUserId);
  if (!res) return false;
  forwardAuthCookies(res, cookies);
  return true;
}

/**
 * Ends an impersonation whose admin no longer holds the role
 * (`loadImpersonator` answered null): the holder leaves the target's identity
 * on this request. A demoted admin is handed back to their own session, now
 * under their new role, exactly as `stopImpersonation` would; a deleted one
 * has no session to return to (it went with their row), so the browser is
 * signed out instead. Either way the impersonation row is gone, its cookies
 * (cookie cache included) are expired, and the audit window is closed.
 *
 * Answers the request itself, with a 303 back to the same URL carrying those
 * cookies, rather than letting it run on as a visitor with no session. Kit
 * writes `event.cookies` onto a response only through `resolve`, and the guard
 * that meets a visitor on a guarded route answers without it, so the cookies
 * were dropped on exactly the requests that needed them: the browser kept the
 * impersonation cookie cache, which BetterAuth serves for five minutes, and
 * the next request revoked again and landed the admin on the login form. The
 * request the target's identity was making is not carried out; the next one is
 * made under whoever the browser now is.
 */
export async function revokeImpersonation(
  request: Request,
  adminUserId: string,
): Promise<Response> {
  const res =
    (await endImpersonation(request, adminUserId)) ??
    (await signOutRevoked(request, adminUserId));

  const headers = new Headers({ location: request.url });
  for (const cookie of res.headers.getSetCookie()) {
    headers.append('set-cookie', cookie);
  }
  return new Response(null, { status: 303, headers });
}

/**
 * BetterAuth's half of leaving an impersonation, then the audit window's:
 * the response whose cookies hand the browser back to the admin, or null when
 * BetterAuth refused, having written nothing.
 */
async function endImpersonation(
  request: Request,
  adminUserId: string,
): Promise<Response | null> {
  const res = await auth.api.stopImpersonating({
    headers: request.headers,
    asResponse: true,
  });
  if (!res.ok) return null;
  await closeImpersonationWindows(adminUserId);
  return res;
}

/** The impersonation of an admin with no session left to return to. */
async function signOutRevoked(
  request: Request,
  adminUserId: string,
): Promise<Response> {
  const res = await auth.api.signOut({
    headers: request.headers,
    asResponse: true,
  });
  await closeImpersonationWindows(adminUserId);
  return res;
}

/** Close every open audit window of this admin: they have one at a time. */
function closeImpersonationWindows(adminUserId: string) {
  return prisma.audit_ImpersonationEvent.updateMany({
    where: { adminUserId, endedAt: null },
    data: { endedAt: new Date() },
  });
}
