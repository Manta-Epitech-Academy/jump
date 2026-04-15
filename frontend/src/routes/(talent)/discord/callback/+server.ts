import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolve } from '$app/paths';
import {
  handleDiscordCallback,
  linkDiscordToStudent,
} from '$lib/server/discord';

export const GET: RequestHandler = async ({ locals, url, cookies }) => {
  if (!locals.user || !locals.talent) {
    throw redirect(303, resolve('/login'));
  }

  const { discordId } = await handleDiscordCallback(
    url,
    cookies,
    '/discord/callback',
    resolve('/settings'),
  );

  await linkDiscordToStudent(locals.talent.id, discordId);

  throw redirect(303, resolve('/settings'));
};
