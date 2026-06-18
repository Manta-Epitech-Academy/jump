import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';
import { getStorage } from '$lib/server/infra/storage';

// Streams a signatory's signature image from S3 for the admin preview. The
// underlying object is immutable per signatory row (a new upload writes a new
// key), so we can cache it aggressively in the browser.
export const GET: RequestHandler = async ({ params, locals }) => {
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
      'Cache-Control': 'private, max-age=3600',
    },
  });
};
