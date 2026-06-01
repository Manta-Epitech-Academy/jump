import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  assertLoadTestAuth,
  seedLoadTalents,
} from '$lib/server/services/loadTestService';

/**
 * Load-test helper: seed N throwaway @loadtest.invalid talents directly in THIS
 * environment's DB, so a remote k6 driver never needs database access.
 *
 * Hard-gated identically to /api/test/login-as (404 unless LOAD_TEST_SECRET is
 * set, bearer must match). Keep out of prod.
 *
 *   POST /api/test/seed-talents
 *   Authorization: Bearer <LOAD_TEST_SECRET>
 *   { "count": 500, "start": 1 }   // seeds load-test-0001..0500
 */
export const POST: RequestHandler = async ({ request }) => {
  assertLoadTestAuth(request);

  const body = (await request.json().catch(() => null)) as {
    count?: number;
    start?: number;
  } | null;

  const count = Math.floor(body?.count ?? 100);
  const start = Math.floor(body?.start ?? 1);
  if (!Number.isFinite(count) || count < 1 || count > 5000) {
    throw error(400, '`count` must be between 1 and 5000');
  }
  if (!Number.isFinite(start) || start < 1) {
    throw error(400, '`start` must be >= 1');
  }

  const result = await seedLoadTalents(count, start);
  return json(result);
};
