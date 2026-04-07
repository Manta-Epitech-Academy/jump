import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';

// BetterAuth handles the OAuth exchange via /api/auth/callback/microsoft.
// This route serves as the post-auth redirect to:
// 1. Verify @epitech.eu domain
// 2. Create StudentProfile if needed

export const GET: RequestHandler = async ({ locals }) => {
  const loginPath = resolve('/camper/login');

  if (!locals.user) {
    throw redirect(303, `${loginPath}?error=OAuthFailed`);
  }

  // Domain verification (defense in depth)
  if (!locals.user.email.endsWith('@epitech.eu')) {
    await prisma.user.delete({ where: { id: locals.user.id } });
    throw redirect(303, `${loginPath}?error=UnauthorizedDomain`);
  }

  // Set role to student. Preserve existing admin role to prevent privilege downgrade.
  if (locals.user.role !== 'admin') {
    await prisma.user.update({
      where: { id: locals.user.id },
      data: { role: 'student' },
    });
  }

  // Create StudentProfile if it doesn't exist
  const existingProfile = await prisma.studentProfile.findUnique({
    where: { userId: locals.user.id },
  });

  if (!existingProfile) {
    // Try to extract name from Microsoft Graph data
    const account = await prisma.account.findFirst({
      where: { userId: locals.user.id, providerId: 'microsoft' },
    });

    await prisma.studentProfile.create({
      data: {
        userId: locals.user.id,
        nom: locals.user.name?.split(' ').slice(-1)[0] || '_pending',
        prenom: locals.user.name?.split(' ')[0] || '_pending',
      },
    });
  }

  throw redirect(303, resolve('/camper'));
};
