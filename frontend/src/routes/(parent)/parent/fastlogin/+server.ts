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
import { checkRateLimit } from '$lib/server/auth/rateLimiter';
import { prisma } from '$lib/server/db';
import { establishOtpSession } from '$lib/server/auth/otpSession';
import { markRecipientOpened } from '$lib/server/services/broadcast/tracking';
import { verifyParentFastloginToken } from '$lib/server/auth/fastloginToken';

export const GET: RequestHandler = async ({
  url,
  request,
  cookies,
  getClientAddress,
}) => {
  const rateLimit = checkRateLimit(getClientAddress());
  if (!rateLimit.allowed) {
    throw error(429, 'Trop de tentatives.');
  }

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
  // recipient open directly from the JWT.
  if (payload.recipientId) markRecipientOpened(payload.recipientId);

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

  await establishOtpSession({ email, request, cookies });
  throw redirect(303, resolve('/parent'));
};
