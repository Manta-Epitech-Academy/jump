import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { findTalentHomeImage } from '$lib/server/services/talentHomeService';
import { storedImageResponse } from '$lib/server/images/remote';
import { talentHomeImageKeyFromPath } from '$lib/domain/talentHome';

// A picture of a campus's home (its highlighted event's, those its note names),
// copied into storage when an admin wrote it (`write_talent_home_highlight`,
// `write_talent_home_note`, `$lib/server/images/remote.ts`).
// The browser never asks the host it came from, which is the point of the copy.
//
// Served only for a key a highlight or a note still references (the picture,
// or the still Jump derived from an animation), so this proxy reads nothing
// else of the bucket whatever path it is handed. Signed-in users only:
// the one surface is the talent home, already behind auth.

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401);

  const image = await findTalentHomeImage(
    talentHomeImageKeyFromPath(params.campusId, params.file),
  );
  if (!image) throw error(404);

  return storedImageResponse(image.key, image.contentType);
};
