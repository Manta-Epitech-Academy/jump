import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  assertLoadTestAuth,
  cleanupLoadTest,
} from '$lib/server/services/loadTestService';

/**
 * Load-test helper: cascade-delete every @loadtest.invalid account from THIS
 * environment's DB. Lets a remote driver tear down its throwaway data over HTTP.
 *
 * Hard-gated identically to /api/test/login-as. Keep out of prod.
 *
 *   POST /api/test/cleanup
 *   Authorization: Bearer <LOAD_TEST_SECRET>
 */
export const POST: RequestHandler = async ({ request }) => {
  assertLoadTestAuth(request);
  const result = await cleanupLoadTest();
  return json(result);
};
