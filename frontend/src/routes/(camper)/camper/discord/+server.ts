import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { base } from '$app/paths';
import { startDiscordOAuth } from '$lib/server/discord';

export const GET: RequestHandler = async ({ locals, cookies }) => {
  if (!locals.user || !locals.talent) {
    throw redirect(303, `${base}/camper/login`);
  }

  throw startDiscordOAuth(cookies, '/camper/discord/callback');
};
