import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';
import { getStorage } from '$lib/server/infra/storage';

// Streams a CMS image from S3 through an authenticated proxy. Content for a
// given id never changes (a new upload gets a new id), so it is safe to cache
// immutably. Any logged-in user may read it: the only surface is the talent
// dashboard welcome message, which is already behind auth.

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401);

  const image = await prisma.cmsImage.findUnique({
    where: { id: params.id },
    select: { s3Key: true, contentType: true },
  });
  if (!image) throw error(404);

  let buffer: Buffer;
  try {
    buffer = await getStorage().get(image.s3Key);
  } catch {
    throw error(404);
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': image.contentType,
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
};
