import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { base } from '$app/paths';
import { startDiscordOAuth } from '$lib/server/discord';

export const GET: RequestHandler = async ({ locals, cookies }) => {
	if (!locals.user || !locals.studentProfile) {
		throw redirect(303, `${base}/camper/login`);
	}

	startDiscordOAuth(cookies, '/camper/discord/callback');
};
