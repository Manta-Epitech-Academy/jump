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
import { prisma } from '$lib/server/db';
import { establishOtpSession } from '$lib/server/auth/otpSession';
import { markRecipientOpened } from '$lib/server/services/broadcast/tracking';
import { ensureTalentUser } from '$lib/server/services/talentAccount';
import { verifyFastloginToken } from '$lib/server/auth/fastloginToken';

// No rate-limit on purpose; security model + known replay gap documented
// in `$lib/server/auth/fastloginToken`.
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
  // recipient open directly from the JWT.
  if (payload.recipientId) markRecipientOpened(payload.recipientId);

  const email = payload.email.toLowerCase().trim();

  const talent = await prisma.talent.findFirst({
    where: { email },
    select: { id: true },
  });
  if (!talent) throw error(404, 'Profil introuvable.');

  // Bootstrap / link the bauth_user on first fastlogin if the talent was
  // seeded or imported but never went through `/login` to create one.
  await ensureTalentUser(talent.id);

  await establishOtpSession({ email, request, cookies });
  throw redirect(303, resolve('/'));
};
