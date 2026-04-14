import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolve } from '$app/paths';
import { handleDiscordCallback, linkDiscordToStaff } from '$lib/server/discord';

export const GET: RequestHandler = async ({ locals, url, cookies }) => {
  if (!locals.user || !locals.staffProfile) {
    throw redirect(303, resolve('/login'));
  }

  const { discordId } = await handleDiscordCallback(
    url,
    cookies,
    '/discord/callback',
    resolve('/'),
  );

  await linkDiscordToStaff(locals.staffProfile.id, discordId);

  throw redirect(303, resolve('/'));
};
