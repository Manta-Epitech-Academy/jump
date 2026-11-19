import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { findEventHeroImage } from '#lib/server/services/eventHeroImages.ts';
import { storedImageResponse } from '#lib/server/images/remote.ts';
import { eventHeroImageKeyFromPath } from '#lib/domain/eventHero.ts';

// A picture of one stage of an event's hero on the talent home, copied into
// storage when an admin wrote it (`write_event_config`,
// `#lib/server/images/remote.ts`). The browser never asks the host it came
// from, which is the point of the copy.
//
// Served only for a key a hero stage still references (the picture, or the
// still Jump derived from an animation), so this proxy reads nothing else of
// the bucket whatever path it is handed. Signed-in users only: the one surface
// is the talent home, already behind auth.

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401);

  const image = await findEventHeroImage(
    eventHeroImageKeyFromPath(params.eventId, params.file),
  );
  if (!image) throw error(404);

  return storedImageResponse(image.key, image.contentType);
};
