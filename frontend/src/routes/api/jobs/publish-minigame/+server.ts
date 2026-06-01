import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { pickNextPublication } from '$lib/server/services/minigameService';
import { safeTokenEquals } from '$lib/server/auth/safeTokenCompare';

export const POST: RequestHandler = async ({ request }) => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const cronSecret = env.CRON_SECRET;

  if (!cronSecret || !token || !safeTokenEquals(token, cronSecret)) {
    throw error(401, 'Unauthorized: Invalid or missing token');
  }

  try {
    const publication = await pickNextPublication();
    if (!publication) {
      return json({ success: false, reason: 'no_eligible_games' });
    }
    console.log(
      `[Job] Minigame published: ${publication.game} level ${publication.level}.`,
    );
    return json({ success: true, publication });
  } catch (err) {
    console.error('[Job] publish-minigame failed:', err);
    throw error(500, 'Internal Server Error');
  }
};
