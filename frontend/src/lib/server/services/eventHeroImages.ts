/**
 * The pictures of an event's hero on the talent home (`EventConfig_HeroImage`),
 * as a page draws them and as the proxy serves them. Copied by
 * `write_event_config` (`#lib/server/images/remote.ts`), so a talent's browser
 * only ever asks Jump for them.
 */
import { prisma } from '#lib/server/db.ts';
import type { ShownPicture } from '#lib/domain/pictures.ts';
import { eventHeroImageUrl } from '#lib/domain/eventHero.ts';

/** A copied hero picture, as a page draws it. */
export function shownEventHeroPicture(image: {
  key: string;
  stillKey: string | null;
  width: number;
  height: number;
}): ShownPicture {
  return {
    url: eventHeroImageUrl(image.key),
    width: image.width,
    height: image.height,
    stillUrl: image.stillKey ? eventHeroImageUrl(image.stillKey) : null,
  };
}

/**
 * The stored picture a key names among the events' hero copies (a picture or
 * the still of an animation), for the proxy that serves them: null for a key
 * nothing references.
 */
export async function findEventHeroImage(
  key: string,
): Promise<{ key: string; contentType: string } | null> {
  const image = await prisma.eventConfig_HeroImage.findFirst({
    where: { OR: [{ key }, { stillKey: key }] },
    select: { key: true, contentType: true },
  });
  if (!image) return null;
  // A still is always a WebP, whatever the animation it was taken from.
  return image.key === key ? image : { key, contentType: 'image/webp' };
}
