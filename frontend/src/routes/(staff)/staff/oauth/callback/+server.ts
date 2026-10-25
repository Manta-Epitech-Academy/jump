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

// BetterAuth handles the OAuth exchange via /api/auth/callback/microsoft, and
// asks the staff door (`auth/staffDoor.ts`, wired as `validateUserInfo`) before
// it writes anything. So whoever lands here was admitted already. This route
// does not admit, it provisions:
// 1. Consumes a StaffInvitation matching the email (if any) to provision
//    campus + role on the StaffProfile.
// 2. Brings `bauth_user.role` back in line with a provisioned profile.
// 3. Lands the member on their space.
//
// It cannot be the gate, and once was: the login page names this route as the
// sign-in's `callbackURL`, but the client chooses that value, and a sign-in
// naming any other page never came here (security audit run-1).

export const GET: RequestHandler = async ({ locals, cookies }) => {
  if (!locals.user) {
    throw redirect(303, `${resolve('/staff/login')}?error=OAuthFailed`);
  }

  const email = locals.user.email.toLowerCase();

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
      // The door admitted this sign-in on an invitation that has been withdrawn
      // since, or on a session opened earlier without passing through here.
      // Nothing to undo: the session carries no profile and no staff role.
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
