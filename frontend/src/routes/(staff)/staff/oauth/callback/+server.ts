import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import {
  bauthRoleForStaffRole,
  getStaffRoleRedirectPath,
} from '$lib/domain/staff';
import { syncMicrosoftAvatar } from '$lib/server/services/microsoftProfile';
import { consumeRedirectCookie } from '$lib/server/auth/loginRedirect';
import { discardStaffSignIn } from '$lib/server/auth/staffDoor';

/**
 * Expire BetterAuth's session-data cookie cache so the next request
 * fetches a fresh session from the DB. Without this, the cookie may
 * still carry the default `role: 'user'` that was set when BetterAuth
 * first created the bauth_user, before the OAuth callback updated the
 * role to 'admin' or 'staff'. This caused "Cannot impersonate" on first
 * login for invited admins.
 */
function expireSessionCache(redirectUrl: string): Response {
  const headers = new Headers({ Location: redirectUrl });
  headers.append(
    'Set-Cookie',
    'better-auth.session_data=; Path=/; Max-Age=0; SameSite=Lax',
  );
  return new Response(null, { status: 303, headers });
}

// BetterAuth handles the OAuth exchange via /api/auth/callback/microsoft.
// This route serves as the post-auth gate that:
// 1. Verifies @epitech.eu domain.
// 2. Consumes a StaffInvitation matching the email (if any) to provision
//    campus + role on the StaffProfile.
// 3. Rejects if no invitation and no existing provisioned StaffProfile: staff
//    must be invited first.
//
// Both refusals hand the sign-in to `discardStaffSignIn` rather than deleting
// the `bauth_user` themselves. BetterAuth may have linked this door onto an
// identity that already existed (a talent's, a guardian's), and deleting one of
// those is silent data loss; the helper carries which of the two it is holding
// and what it is allowed to do about it.

export const GET: RequestHandler = async ({ locals, cookies }) => {
  // Both or neither: `hooks.server.ts` fills the pair from one `getSession`. The
  // session is read below to discard exactly the one this sign-in minted, so the
  // guard names it rather than asserting it further down.
  if (!locals.user || !locals.session) {
    throw redirect(303, `${resolve('/staff/login')}?error=OAuthFailed`);
  }

  const email = locals.user.email.toLowerCase();

  if (!email.endsWith('@epitech.eu')) {
    await discardStaffSignIn(locals.user.id, locals.session.id);
    throw redirect(303, `${resolve('/staff/login')}?error=UnauthorizedDomain`);
  }

  const existingProfile = await prisma.staffProfile.findUnique({
    where: { userId: locals.user.id },
  });

  let profile = existingProfile;

  // Provision from invitation on first login (or if profile has no role yet).
  // Admins legitimately have no campus, so do not treat null campusId as
  // "not provisioned".
  if (!profile?.staffRole) {
    const invitation = await prisma.staffInvitation.findUnique({
      where: { email },
    });

    if (!invitation) {
      // No invitation and not an already-provisioned staff: reject
      await discardStaffSignIn(locals.user.id, locals.session.id);
      throw redirect(303, `${resolve('/staff/login')}?error=NotInvited`);
    }

    const [provisioned] = await prisma.$transaction([
      prisma.staffProfile.upsert({
        where: { userId: locals.user.id },
        update: {
          campusId: invitation.campusId,
          staffRole: invitation.staffRole,
        },
        create: {
          userId: locals.user.id,
          campusId: invitation.campusId,
          staffRole: invitation.staffRole,
        },
      }),
      prisma.staffInvitation.delete({ where: { email } }),
      prisma.bauth_user.update({
        where: { id: locals.user.id },
        data: { role: bauthRoleForStaffRole(invitation.staffRole) },
      }),
    ]);

    profile = provisioned;
  } else if (locals.user.role !== 'staff' && locals.user.role !== 'admin') {
    await prisma.bauth_user.update({
      where: { id: locals.user.id },
      data: { role: bauthRoleForStaffRole(profile.staffRole) },
    });
  }

  const targetPath = getStaffRoleRedirectPath(profile.staffRole);

  if (!targetPath) {
    throw redirect(303, `${resolve('/staff/login')}?error=NoRole`);
  }

  await syncMicrosoftAvatar(locals.user.id);

  // Replay where the guard bounced them from (captured at login), else the
  // role's default landing page. consumeRedirectCookie clears the cookie too;
  // the deletion rides the raw Response below (SvelteKit merges cookie mutations
  // into both `throw redirect()` and returned Responses).
  const back = consumeRedirectCookie(cookies, 'staff');

  // Expire the cookie cache so the fresh role is picked up immediately.
  // Using a raw Response instead of `throw redirect()` so we can set the
  // Set-Cookie header: SvelteKit's redirect() doesn't allow that.
  return expireSessionCache(back ?? resolve(targetPath));
};
