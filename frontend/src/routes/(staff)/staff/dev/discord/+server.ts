import { redirect, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import { startDiscordOAuth } from '$lib/server/discord';

// GET /discord — redirects to Discord OAuth consent screen
export const GET: RequestHandler = async ({ locals, cookies }) => {
  if (!locals.user || !locals.staffProfile) {
    throw redirect(303, resolve('/staff/login'));
  }

  throw startDiscordOAuth(cookies, '/staff/dev/discord/callback');
};

// POST /discord — unlinks Discord from staff profile
export const POST: RequestHandler = async ({ locals }) => {
  if (!locals.user || !locals.staffProfile) {
    throw redirect(303, resolve('/staff/login'));
  }

  await prisma.staffProfile.update({
    where: { id: locals.staffProfile.id },
    data: { discordId: null },
  });

  throw redirect(303, resolve('/staff/dev'));
};
