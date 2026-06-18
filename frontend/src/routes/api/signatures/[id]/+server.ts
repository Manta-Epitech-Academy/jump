import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';
import { getStorage } from '$lib/server/infra/storage';

// Streams a signatory's signature image from S3 for the admin preview. Unlike
// the CMS-image proxy, a signatory keeps its id across an image replacement
// (only signatureKey changes), so the id alone is NOT an immutable cache key.
// The preview appends `?v=<updatedAt>` as a durable version token: when it is
// present the bytes for that exact version never change, so we cache them
// immutably; a bare hit (no `?v`) falls back to a short cache.
export const GET: RequestHandler = async ({ params, locals, url }) => {
  if (!locals.staffProfile) throw error(401);

  const signatory = await prisma.signatory.findUnique({
    where: { id: params.id },
    select: { signatureKey: true, contentType: true },
  });
  if (!signatory) throw error(404);

  let buffer: Buffer;
  try {
    buffer = await getStorage().get(signatory.signatureKey);
  } catch {
    throw error(404);
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': signatory.contentType || 'application/octet-stream',
      'Cache-Control': url.searchParams.has('v')
        ? 'private, max-age=31536000, immutable'
        : 'private, max-age=300',
    },
  });
};
