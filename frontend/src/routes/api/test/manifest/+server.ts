import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  assertLoadTestAuth,
  buildLoadManifest,
} from '$lib/server/services/loadTestService';

/**
 * Load-test helper: build the k6 manifest server-side and return it as JSON, so
 * a remote driver gets the pool of talents/staff/events/etc. it must sample from
 * without ever querying the DB. The client persists this verbatim to
 * load/data.json.
 *
 * Hard-gated identically to /api/test/login-as. Keep out of prod.
 *
 *   GET /api/test/manifest?sample=50
 *   Authorization: Bearer <LOAD_TEST_SECRET>
 */
export const GET: RequestHandler = async ({ request, url }) => {
  assertLoadTestAuth(request);

  const sample = Math.floor(Number(url.searchParams.get('sample') ?? 50));
  if (!Number.isFinite(sample) || sample < 1 || sample > 2000) {
    throw error(400, '`sample` must be between 1 and 2000');
  }

  const manifest = await buildLoadManifest(sample);
  return json(manifest);
};
