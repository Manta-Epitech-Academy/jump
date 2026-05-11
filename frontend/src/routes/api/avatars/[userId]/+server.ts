import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStorage } from '$lib/server/infra/storage';
import { avatarStorageKey } from '$lib/server/services/microsoftProfile';

// Streams a user's avatar from S3. The image URL stored in bauth_user.image
// carries a `?v=<token>` cache-buster updated on every sync, so we can safely
// serve with long-lived browser caching.

export const GET: RequestHandler = async ({ params, locals, url }) => {
  if (!locals.user) throw error(401);

  let buffer: Buffer;
  try {
    buffer = await getStorage().get(avatarStorageKey(params.userId));
  } catch {
    throw error(404);
  }

  const cacheControl = url.searchParams.has('v')
    ? 'private, max-age=31536000, immutable'
    : 'private, max-age=300';

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': cacheControl,
    },
  });
};
