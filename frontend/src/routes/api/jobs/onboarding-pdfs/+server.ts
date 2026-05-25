import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { processPendingOnboardingPdfJobs } from '$lib/server/services/onboardingPdfJobService';

/**
 * Drains the onboarding-PDF queue: generates the PDF + uploads to S3 for
 * every job in `pending` status. Designed to be polled every minute by an
 * external scheduler. Failures are recorded on the job row (status='error',
 * errorMessage set) — no auto-retry.
 */
export const POST: RequestHandler = async ({ request }) => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const cronSecret = env.CRON_SECRET;

  if (!cronSecret || token !== cronSecret) {
    throw error(401, 'Unauthorized: Invalid or missing token');
  }

  try {
    const result = await processPendingOnboardingPdfJobs();
    return json({ success: true, ...result });
  } catch (err) {
    console.error('[job] onboarding-pdfs processing failed', err);
    throw error(500, 'Internal Server Error');
  }
};
