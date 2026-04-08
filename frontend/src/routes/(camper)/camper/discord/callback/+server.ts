import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { base } from '$app/paths';
import { env } from '$env/dynamic/private';
import { prisma } from '$lib/server/db';

// GET /camper/discord/callback — exchanges code for Discord user ID
export const GET: RequestHandler = async ({ locals, url, cookies }) => {
	const settingsPath = `${base}/camper/settings`;

	if (!locals.user || !locals.studentProfile) {
		throw redirect(303, `${base}/camper/login`);
	}

	// Verify state
	const state = url.searchParams.get('state');
	const storedState = cookies.get('discord_oauth_state');
	cookies.delete('discord_oauth_state', { path: `${base}/camper/discord` });

	if (!state || state !== storedState) {
		throw redirect(303, `${settingsPath}?error=InvalidState`);
	}

	const code = url.searchParams.get('code');
	if (!code) {
		throw redirect(303, `${settingsPath}?error=OAuthFailed`);
	}

	// Exchange code for access token
	const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: env.DISCORD_CLIENT_ID!,
			client_secret: env.DISCORD_CLIENT_SECRET!,
			grant_type: 'authorization_code',
			code,
			redirect_uri: `${env.ORIGIN}${base}/camper/discord/callback`,
		}),
	});

	if (!tokenRes.ok) {
		console.error('Discord token exchange failed:', await tokenRes.text());
		throw redirect(303, `${settingsPath}?error=OAuthFailed`);
	}

	const tokenData = await tokenRes.json();

	// Fetch Discord user info
	const userRes = await fetch('https://discord.com/api/users/@me', {
		headers: { Authorization: `Bearer ${tokenData.access_token}` },
	});

	if (!userRes.ok) {
		console.error('Discord user fetch failed:', await userRes.text());
		throw redirect(303, `${settingsPath}?error=OAuthFailed`);
	}

	const discordUser = await userRes.json();

	// Clear this Discord ID from any other student who had it linked
	await prisma.studentProfile.updateMany({
		where: { discordId: discordUser.id, id: { not: locals.studentProfile.id } },
		data: { discordId: null },
	});

	// Store Discord user ID on the student profile
	await prisma.studentProfile.update({
		where: { id: locals.studentProfile.id },
		data: { discordId: discordUser.id },
	});

	throw redirect(303, settingsPath);
};
