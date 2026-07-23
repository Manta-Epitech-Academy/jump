import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rolloverSchoolYear } from '$lib/server/services/schoolingService';
import { env } from '$env/dynamic/private';
import { safeTokenEquals } from '$lib/server/auth/safeTokenCompare';

export const POST: RequestHandler = async ({ request }) => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const cronSecret = env.CRON_SECRET;

  if (!cronSecret || !token || !safeTokenEquals(token, cronSecret)) {
    throw error(401, 'Unauthorized: Invalid or missing token');
  }

  try {
    const result = await rolloverSchoolYear();
    console.log(
      `[Job] School-year rollover job completed: ${result.createdCount} new records created out of ${result.processedCount} processed.`,
    );
    return json({ success: true, ...result });
  } catch (err) {
    console.error('[Job] School-year rollover job failed:', err);
    throw error(500, 'Internal Server Error');
  }
};
