/**
 * Parent fast-login entry point. Consumes a JWT minted at broadcast time
 * (audience `jump:parent_fastlogin`) and creates a BetterAuth session for
 * the `bauth_user` whose email matches the token's `sub`, provided their
 * role is `parent`. Mirrors `/fastlogin` for talents, but never bootstraps
 * a new account — a parent user must already exist (the welcome flow
 * provisions them).
 */

import type { RequestHandler } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { auth } from '$lib/server/auth';
import { prisma } from '$lib/server/db';
import { forwardAuthCookies } from '$lib/server/auth/cookies';
import { verifyParentFastloginToken } from '$lib/server/services/broadcast/personalization';

export const GET: RequestHandler = async ({ url, request, cookies }) => {
  const token = url.searchParams.get('token');
  if (!token) throw error(400, 'Missing token');

  let payload;
  try {
    payload = await verifyParentFastloginToken(token);
  } catch {
    throw error(401, 'Lien expiré ou invalide.');
  }

  // Belt-and-braces tracking: if the link wasn't wrapped in `<a>` (plain
  // text in some clients) the `tracking_id` hook never fires, so mark the
  // recipient open directly from the JWT. Idempotent via `openedAt: null`.
  if (payload.recipientId) {
    prisma.broadcastRecipient
      .updateMany({
        where: { id: payload.recipientId, openedAt: null },
        data: { openedAt: new Date() },
      })
      .catch(() => {});
  }

  const email = payload.email.toLowerCase().trim();

  // Require an existing parent user — unlike `/fastlogin` we don't
  // bootstrap one here. Parent accounts are provisioned by the welcome
  // flow once their child completes onboarding.
  const user = await prisma.bauth_user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });
  if (!user || user.role !== 'parent') {
    throw error(404, 'Compte parent introuvable.');
  }

  const otp = await auth.api.createVerificationOTP({
    body: { email, type: 'sign-in' },
  });
  const authResponse = await auth.api.signInEmailOTP({
    body: { email, otp },
    asResponse: true,
    headers: request.headers,
  });
  if (!authResponse.ok) {
    throw error(500, "Échec de l'authentification.");
  }

  forwardAuthCookies(authResponse, cookies);
  throw redirect(303, resolve('/parent'));
};
