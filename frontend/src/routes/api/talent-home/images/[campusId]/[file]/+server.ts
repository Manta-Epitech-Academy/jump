import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';
import { storedImageResponse } from '$lib/server/images/remote';
import { highlightImageKeyFromPath } from '$lib/domain/talentHome';

// The picture of a campus's highlighted event, copied into storage when an
// admin wrote it (`write_talent_home_highlight`, `$lib/server/images/remote.ts`).
// The browser never asks the host it came from, which is the point of the copy.
//
// Served only for a key a highlight still references (the picture, or the
// still Jump derived from an animation), so this proxy reads
// nothing else of the bucket whatever path it is handed. Signed-in users only:
// the one surface is the talent home, already behind auth.

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401);

  const key = highlightImageKeyFromPath(params.campusId, params.file);
  const image = await prisma.talentHome_HighlightImage.findFirst({
    where: { OR: [{ key }, { stillKey: key }] },
    select: { key: true, contentType: true },
  });
  if (!image) throw error(404);

  return image.key === key
    ? storedImageResponse(key, image.contentType)
    : storedImageResponse(key, 'image/webp');
};
