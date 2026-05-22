/**
 * Fast-login entry point — consumes a JWT minted at broadcast time and
 * creates a BetterAuth session for the target talent, then redirects to
 * the talent dashboard.
 *
 * Mirrors the bootstrap logic of the regular `/login` OTP flow: if the
 * talent has no linked `bauth_user` yet (seeded profile that never logged
 * in), we create it on the fly. After that we mint and immediately consume
 * an OTP through BetterAuth to obtain the session cookies — same end state
 * as if the recipient had typed the OTP themselves.
 */

import type { RequestHandler } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { auth } from '$lib/server/auth';
import { prisma } from '$lib/server/db';
import { forwardAuthCookies } from '$lib/server/auth/cookies';
import { ensureTalentUser } from '$lib/server/services/talentAccount';
import { verifyFastloginToken } from '$lib/server/services/broadcast/personalization';

export const GET: RequestHandler = async ({ url, request, cookies }) => {
  const token = url.searchParams.get('token');
  if (!token) throw error(400, 'Missing token');

  let payload;
  try {
    payload = await verifyFastloginToken(token);
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

  const talent = await prisma.talent.findFirst({
    where: { email },
    select: { id: true },
  });
  if (!talent) throw error(404, 'Profil introuvable.');

  // Bootstrap / link the bauth_user on first fastlogin if the talent was
  // seeded or imported but never went through `/login` to create one.
  await ensureTalentUser(talent.id);

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
  throw redirect(303, resolve('/'));
};
