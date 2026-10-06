import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';
import { storedImageResponse } from '$lib/server/images/remote';
import { workshopCoverKeyFromPath } from '$lib/domain/workshops';

// A picture of an activity's cover, copied from its CTFd instance
// (`$lib/server/workshops/cover.ts`), streamed from storage. The browser never
// asks the instance itself, which is the point of the copy.
//
// Served only for a key a cover row still references, so this proxy reads
// nothing else of the bucket whatever path it is handed. Signed-in users only,
// like the welcome message's images: the one surface is the talent dashboard,
// already behind auth.

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401);

  const image = await prisma.workshop_CoverImage.findUnique({
    where: { key: workshopCoverKeyFromPath(params.instanceId, params.file) },
    select: { key: true, contentType: true },
  });
  if (!image) throw error(404);

  return storedImageResponse(image.key, image.contentType);
};
