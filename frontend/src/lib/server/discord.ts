import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { prisma } from '$lib/server/db';
import crypto from 'crypto';
import type { Cookies } from '@sveltejs/kit';

/**
 * Initiates Discord OAuth by redirecting to Discord's consent screen.
 * `callbackPath` is the absolute path (without origin) for the OAuth callback, e.g. '/camper/discord/callback'.
 */
export function startDiscordOAuth(cookies: Cookies, callbackPath: string) {
  const state = crypto.randomBytes(16).toString('hex');
  cookies.set('discord_oauth_state', state, {
    path: `${base}/${callbackPath.split('/').slice(0, -1).join('/')}`.replace(
      /\/+/g,
      '/',
    ),
    httpOnly: true,
    secure: !dev,
    sameSite: 'lax',
    maxAge: 300,
  });

  const redirectUri = `${env.ORIGIN}${base}${callbackPath}`;

  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'identify',
    state,
  });

  throw redirect(303, `https://discord.com/api/oauth2/authorize?${params}`);
}

/**
 * Handles the Discord OAuth callback: verifies state, exchanges code, returns Discord user ID.
 * Returns `null` on failure (redirects to errorRedirect with ?error= param).
 */
export async function handleDiscordCallback(
  url: URL,
  cookies: Cookies,
  callbackPath: string,
  errorRedirect: string,
): Promise<{ discordId: string } | never> {
  const state = url.searchParams.get('state');
  const storedState = cookies.get('discord_oauth_state');
  cookies.delete('discord_oauth_state', {
    path: `${base}/${callbackPath.split('/').slice(0, -1).join('/')}`.replace(
      /\/+/g,
      '/',
    ),
  });

  if (!state || state !== storedState) {
    throw redirect(303, `${errorRedirect}?error=InvalidState`);
  }

  const code = url.searchParams.get('code');
  if (!code) {
    throw redirect(303, `${errorRedirect}?error=OAuthFailed`);
  }

  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID!,
      client_secret: env.DISCORD_CLIENT_SECRET!,
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${env.ORIGIN}${base}${callbackPath}`,
    }),
  });

  if (!tokenRes.ok) {
    console.error('Discord token exchange failed:', await tokenRes.text());
    throw redirect(303, `${errorRedirect}?error=OAuthFailed`);
  }

  const tokenData = await tokenRes.json();

  const userRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) {
    console.error('Discord user fetch failed:', await userRes.text());
    throw redirect(303, `${errorRedirect}?error=OAuthFailed`);
  }

  const discordUser = await userRes.json();
  return { discordId: discordUser.id };
}

/**
 * Links a Discord ID to a staff profile, clearing any previous owner.
 */
export async function linkDiscordToStaff(
  staffProfileId: string,
  discordId: string,
) {
  await prisma.$transaction([
    prisma.staffProfile.updateMany({
      where: { discordId, id: { not: staffProfileId } },
      data: { discordId: null },
    }),
    prisma.studentProfile.updateMany({
      where: { discordId },
      data: { discordId: null },
    }),
    prisma.staffProfile.update({
      where: { id: staffProfileId },
      data: { discordId },
    }),
  ]);
}

/**
 * Links a Discord ID to a student profile, clearing any previous owner.
 */
export async function linkDiscordToStudent(
  studentProfileId: string,
  discordId: string,
) {
  await prisma.$transaction([
    prisma.studentProfile.updateMany({
      where: { discordId, id: { not: studentProfileId } },
      data: { discordId: null },
    }),
    prisma.staffProfile.updateMany({
      where: { discordId },
      data: { discordId: null },
    }),
    prisma.studentProfile.update({
      where: { id: studentProfileId },
      data: { discordId },
    }),
  ]);
}
