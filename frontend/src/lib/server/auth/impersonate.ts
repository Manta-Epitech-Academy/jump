import type { Cookies } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { auth } from '$lib/server/auth';
import { forwardAuthCookies } from '$lib/server/auth/cookies';
import { ensureTalentUser } from '$lib/server/services/talentAccount';
import { getStaffRoleRedirectPath } from '$lib/domain/staff';

export type ImpersonationTarget =
  // `id` is a Talent id: a seeded talent may have no login account yet, so it is
  // bootstrapped on the fly via ensureTalentUser.
  | { kind: 'talent'; id: string }
  // `id` is a bauth_user id (a staff member always already has one).
  | { kind: 'staff'; id: string };

export type ImpersonationResult =
  { ok: true; redirect: string } | { ok: false; reason: 'no_email' | 'failed' };

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
    } catch {
      // ensureTalentUser throws when the talent has no email to seed an account.
      return { ok: false, reason: 'no_email' };
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

  // BetterAuth has no explicit "impersonation ended" server callback we can
  // trust from all exit paths. Keep a single open window per admin as a
  // best-effort trail: close any previous open rows before opening this one.
  const now = new Date();
  await prisma.$transaction([
    prisma.audit_ImpersonationEvent.updateMany({
      where: { adminUserId, endedAt: null },
      data: { endedAt: now },
    }),
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
