import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { syncRefComp } from '$lib/server/services/refCompSync';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request }) => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const cronSecret = env.CRON_SECRET;

  if (!cronSecret || token !== cronSecret) {
    throw error(401, 'Unauthorized: Invalid or missing token');
  }

  try {
    const result = await syncRefComp();
    if (result.status === 'noop') {
      console.log(`[Job] ref_comp sync no-op (HEAD ${result.commitSha}).`);
    } else {
      console.log(
        `[Job] ref_comp synced @ ${result.commitSha}: ` +
          `${result.counts.competences} competences, ` +
          `${result.counts.skills} skills, ` +
          `${result.counts.skillLevels} skill levels, ` +
          `${result.counts.observables} observables.`,
      );
    }
    return json(result);
  } catch (err) {
    console.error('[Job] ref_comp sync failed:', err);
    throw error(
      500,
      err instanceof Error ? err.message : 'Internal Server Error',
    );
  }
};
