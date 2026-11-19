import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AnonymizationService } from '#lib/server/services/anonymizationService.ts';
import { CRON_SECRET } from '$app/env/private';
import { safeTokenEquals } from '#lib/server/auth/safeTokenCompare.ts';

export const POST: RequestHandler = async ({ request }) => {
  // 1. Security Check: Compare the provided token with the secret env var
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const cronSecret = CRON_SECRET;

  if (!cronSecret || !token || !safeTokenEquals(token, cronSecret)) {
    throw error(401, 'Unauthorized: Invalid or missing token');
  }

  // 2. Trigger the anonymization job
  try {
    const count = await AnonymizationService.anonymizeInactiveStudents();
    console.log(
      `[Job] Anonymization job completed: ${count} students processed.`,
    );
    return Response.json({ success: true, count });
  } catch (err) {
    console.error('[Job] Anonymization job failed:', err);
    throw error(500, 'Internal Server Error');
  }
};
