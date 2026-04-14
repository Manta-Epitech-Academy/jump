import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { base } from '$app/paths';
import {
  handleDiscordCallback,
  linkDiscordToStudent,
} from '$lib/server/discord';

export const GET: RequestHandler = async ({ locals, url, cookies }) => {
  if (!locals.user || !locals.talent) {
    throw redirect(303, `${base}/camper/login`);
  }

  const { discordId } = await handleDiscordCallback(
    url,
    cookies,
    '/camper/discord/callback',
    `${base}/camper/settings`,
  );

  await linkDiscordToStudent(locals.talent.id, discordId);

  throw redirect(303, `${base}/camper/settings`);
};
