import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';
import { storedImageResponse } from '$lib/server/images/remote';
import { workshopCoverKeyFromPath } from '$lib/domain/workshops';

// A picture of an activity's cover, copied into storage when an admin wrote it
// (`write_workshop`, `$lib/server/images/remote.ts`). The browser never
// asks the host it came from, which is the point of the copy.
//
// Served only for a key a cover row still references (the picture, or the
// still Jump derived from an animation), so this proxy reads nothing else of
// the bucket whatever path it is handed. Signed-in users only: the surfaces are
// the talent's home and « Mon parcours », already behind auth.

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401);

  const key = workshopCoverKeyFromPath(params.activityId, params.file);
  const image = await prisma.workshop_CoverImage.findFirst({
    where: { OR: [{ key }, { stillKey: key }] },
    select: { key: true, contentType: true },
  });
  if (!image) throw error(404);

  return image.key === key
    ? storedImageResponse(key, image.contentType)
    : storedImageResponse(key, 'image/webp');
};
