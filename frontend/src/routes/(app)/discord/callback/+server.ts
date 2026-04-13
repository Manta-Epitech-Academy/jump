import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { base } from '$app/paths';
import { handleDiscordCallback, linkDiscordToStaff } from '$lib/server/discord';

export const GET: RequestHandler = async ({ locals, url, cookies }) => {
  if (!locals.user || !locals.staffProfile) {
    throw redirect(303, `${base}/login`);
  }

  const { discordId } = await handleDiscordCallback(
    url,
    cookies,
    '/discord/callback',
    base || '/',
  );

  await linkDiscordToStaff(locals.staffProfile.id, discordId);

  throw redirect(303, base || '/');
};
