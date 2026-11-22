import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CRON_SECRET } from '$app/env/private';
import { pickNextPublication } from '#lib/server/services/minigameService.ts';
import { safeTokenEquals } from '#lib/server/auth/safeTokenCompare.ts';

export const POST: RequestHandler = async ({ request }) => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const cronSecret = CRON_SECRET;

  if (!cronSecret || !token || !safeTokenEquals(token, cronSecret)) {
    throw error(401, 'Unauthorized: Invalid or missing token');
  }

  try {
    const publication = await pickNextPublication();
    if (!publication) {
      return Response.json({ success: false, reason: 'no_eligible_games' });
    }
    console.log(
      `[Job] Minigame published: ${publication.game} level ${publication.level}.`,
    );
    return Response.json({ success: true, publication });
  } catch (err) {
    console.error('[Job] publish-minigame failed:', err);
    throw error(500, 'Internal Server Error');
  }
};
