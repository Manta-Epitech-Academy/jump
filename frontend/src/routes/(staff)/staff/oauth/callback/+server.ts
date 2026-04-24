import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import { getStaffRoleRedirectPath } from '$lib/domain/staff';

// BetterAuth handles the OAuth exchange via /api/auth/callback/microsoft.
// This route serves as the post-auth gate that:
// 1. Verifies @epitech.eu domain.
// 2. Consumes a StaffInvitation matching the email (if any) to provision
//    campus + role on the StaffProfile.
// 3. Rejects (and deletes the just-created bauth_user) if no invitation and
//    no existing provisioned StaffProfile — staff must be invited first.

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(303, `${resolve('/staff/login')}?error=OAuthFailed`);
  }

  const email = locals.user.email.toLowerCase();

  if (!email.endsWith('@epitech.eu')) {
    await prisma.bauth_user.delete({ where: { id: locals.user.id } });
    throw redirect(303, `${resolve('/staff/login')}?error=UnauthorizedDomain`);
  }

  const existingProfile = await prisma.staffProfile.findUnique({
    where: { userId: locals.user.id },
  });

  let profile = existingProfile;

  // Provision from invitation on first login (or if profile is still un-provisioned)
  if (!profile?.staffRole || !profile?.campusId) {
    const invitation = await prisma.staffInvitation.findUnique({
      where: { email },
    });

    if (!invitation) {
      // No invitation and not an already-provisioned staff — reject
      await prisma.bauth_user.delete({ where: { id: locals.user.id } });
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
        data: {
          role: invitation.staffRole === 'admin' ? 'admin' : 'staff',
        },
      }),
    ]);

    profile = provisioned;
  } else if (locals.user.role !== 'staff' && locals.user.role !== 'admin') {
    await prisma.bauth_user.update({
      where: { id: locals.user.id },
      data: { role: profile.staffRole === 'admin' ? 'admin' : 'staff' },
    });
  }

  const targetPath = getStaffRoleRedirectPath(profile.staffRole);

  if (!targetPath) {
    throw redirect(303, `${resolve('/staff/login')}?error=NoRole`);
  }

  throw redirect(303, resolve(targetPath));
};
