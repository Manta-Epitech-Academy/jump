import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';

// BetterAuth handles the OAuth exchange via /api/auth/callback/microsoft.
// This route serves as the post-auth redirect to:
// 1. Verify @epitech.eu domain
// 2. Create Talent if needed

export const GET: RequestHandler = async ({ locals }) => {
  const loginPath = resolve('/camper/login');

  if (!locals.user) {
    throw redirect(303, `${loginPath}?error=OAuthFailed`);
  }

  // Domain verification (defense in depth)
  if (!locals.user.email.endsWith('@epitech.eu')) {
    await prisma.bauth_user.delete({ where: { id: locals.user.id } });
    throw redirect(303, `${loginPath}?error=UnauthorizedDomain`);
  }

  // Set role to student. Preserve existing admin role to prevent privilege downgrade.
  if (locals.user.role !== 'admin') {
    await prisma.bauth_user.update({
      where: { id: locals.user.id },
      data: { role: 'student' },
    });
  }

  // Link or create Talent
  const linkedProfile = await prisma.talent.findUnique({
    where: { userId: locals.user.id },
  });

  if (!linkedProfile) {
    // Check for an unlinked profile matching this email (e.g. created by worker API)
    const unlinkedProfile = await prisma.talent.findUnique({
      where: { email: locals.user.email },
    });

    if (unlinkedProfile) {
      await prisma.talent.update({
        where: { id: unlinkedProfile.id },
        data: { userId: locals.user.id },
      });
    } else {
      await prisma.talent.create({
        data: {
          userId: locals.user.id,
          email: locals.user.email,
          nom: locals.user.name?.split(' ').slice(-1)[0] || '_pending',
          prenom: locals.user.name?.split(' ')[0] || '_pending',
        },
      });
    }
  }

  throw redirect(303, resolve('/camper'));
};
