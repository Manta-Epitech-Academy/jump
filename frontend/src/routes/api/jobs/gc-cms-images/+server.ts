import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { safeTokenEquals } from '$lib/server/auth/safeTokenCompare';
import { sweepOrphanCmsImages } from '$lib/server/cms/references';

// Reclaims CMS images no welcome page references anymore: never-saved uploads,
// images dropped from content, and rows orphaned by a deleted event. Same
// Bearer-token contract as the other cron jobs (see /api/jobs/anonymize).

export const POST: RequestHandler = async ({ request }) => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const cronSecret = env.CRON_SECRET;
  if (!cronSecret || !token || !safeTokenEquals(token, cronSecret)) {
    throw error(401, 'Unauthorized: Invalid or missing token');
  }

  try {
    const deleted = await sweepOrphanCmsImages();
    console.log(
      `[Job] gc-cms-images completed: ${deleted} image(s) reclaimed.`,
    );
    return json({ success: true, deleted });
  } catch (err) {
    console.error('[Job] gc-cms-images failed:', err);
    throw error(500, 'Internal Server Error');
  }
};
