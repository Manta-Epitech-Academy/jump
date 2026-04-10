import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';

// BetterAuth handles the OAuth exchange via /api/auth/callback/microsoft.
// This route serves as the post-auth redirect to:
// 1. Verify @epitech.eu domain
// 2. Create StaffProfile if needed
// 3. Fetch Microsoft avatar

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) {
    throw redirect(303, `${resolve('/login')}?error=OAuthFailed`);
  }

  // Domain verification (defense in depth)
  if (!locals.user.email.endsWith('@epitech.eu')) {
    // Delete the user BetterAuth just created
    await prisma.bauth_user.delete({ where: { id: locals.user.id } });
    throw redirect(303, `${resolve('/login')}?error=UnauthorizedDomain`);
  }

  // Set role to staff if not already set
  if (locals.user.role !== 'staff' && locals.user.role !== 'admin') {
    await prisma.bauth_user.update({
      where: { id: locals.user.id },
      data: { role: 'staff' },
    });
  }

  // Create StaffProfile if it doesn't exist
  const existingProfile = await prisma.staffProfile.findUnique({
    where: { userId: locals.user.id },
  });

  if (!existingProfile) {
    // Fetch avatar from Microsoft Graph API if we have an account with access token
    let avatarUrl: string | null = null;
    const account = await prisma.bauth_account.findFirst({
      where: { userId: locals.user.id, providerId: 'microsoft' },
    });

    if (account?.accessToken) {
      try {
        const response = await fetch(
          'https://graph.microsoft.com/v1.0/me/photo/$value',
          { headers: { Authorization: `Bearer ${account.accessToken}` } },
        );
        if (response.ok) {
          // TODO: implement S3 file storage — for now store as data URL or skip
        }
      } catch {
        // Avatar fetch is non-critical
      }
    }

    await prisma.staffProfile.create({
      data: {
        userId: locals.user.id,
        avatar: avatarUrl,
      },
    });
  }

  // Update user name from Microsoft if not set
  if (!locals.user.name) {
    const account = await prisma.bauth_account.findFirst({
      where: { userId: locals.user.id, providerId: 'microsoft' },
    });
    if (account) {
      // Name should have been set by BetterAuth from the OAuth profile
    }
  }

  throw redirect(303, resolve('/'));
};
