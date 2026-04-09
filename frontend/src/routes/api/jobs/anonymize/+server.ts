import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AnonymizationService } from '$lib/server/services/anonymizationService';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request }) => {
  // 1. Security Check: Compare the provided token with the secret env var
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const cronSecret = env.CRON_SECRET;

  if (!cronSecret || token !== cronSecret) {
    throw error(401, 'Unauthorized: Invalid or missing token');
  }

  // 2. Trigger the anonymization job
  try {
    const count = await AnonymizationService.anonymizeInactiveStudents();
    console.log(
      `[Job] Anonymization job completed: ${count} students processed.`,
    );
    return json({ success: true, count });
  } catch (err) {
    console.error('[Job] Anonymization job failed:', err);
    throw error(500, 'Internal Server Error');
  }
};
