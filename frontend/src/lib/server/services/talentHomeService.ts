import { prisma } from '$lib/server/db';
import type { ShownPicture } from '$lib/domain/pictures';
import { renderAuthoredMarkdown } from '$lib/markdown';
import { dbDateToKey } from '$lib/domain/eventPresence';
import {
  talentHomeImageUrl,
  isHighlightOpen,
  type TalentHome,
} from '$lib/domain/talentHome';

/** A copied picture of the campus's home, as a page draws it. */
function shownPicture(image: {
  key: string;
  stillKey: string | null;
  width: number;
  height: number;
}): ShownPicture {
  return {
    url: talentHomeImageUrl(image.key),
    width: image.width,
    height: image.height,
    stillUrl: image.stillKey ? talentHomeImageUrl(image.stillKey) : null,
  };
}

/**
 * The stored picture a key names, among a campus home's copies (its
 * highlight's, its note's, or the still of either), for the proxy that serves
 * them: null for a key nothing references.
 */
export async function findTalentHomeImage(
  key: string,
): Promise<{ key: string; contentType: string } | null> {
  const where = { OR: [{ key }, { stillKey: key }] };
  const select = { key: true, contentType: true } as const;
  const image =
    (await prisma.talentHome_HighlightImage.findFirst({ where, select })) ??
    (await prisma.talentHome_NoteImage.findFirst({ where, select }));
  if (!image) return null;
  // A still is always a WebP, whatever the animation it was taken from.
  return image.key === key ? image : { key, contentType: 'image/webp' };
}

/**
 * What a talent's home shows of their campus: its note, rendered, and its
 * highlighted event while that event's day has not passed.
 *
 * Takes the talent's effective campus, which the request hooks already resolve
 * into `locals.talentCampusId` (`resolveTalentCampus`, the campus of their
 * latest event). `null` is a talent with no enrolment at all: they belong to no
 * campus and get neither.
 */
export async function getTalentHome(
  campusId: string | null,
  now: Date = new Date(),
): Promise<TalentHome> {
  if (!campusId) return { note: null, highlight: null };

  const campus = await prisma.campus.findUnique({
    where: { id: campusId },
    select: {
      timezone: true,
      homeNote: {
        select: {
          markdown: true,
          images: {
            select: {
              sourceUrl: true,
              key: true,
              stillKey: true,
              width: true,
              height: true,
            },
          },
        },
      },
      homeHighlight: {
        select: {
          title: true,
          summary: true,
          date: true,
          url: true,
          image: {
            select: { key: true, stillKey: true, width: true, height: true },
          },
        },
      },
    },
  });
  const highlight = campus?.homeHighlight;

  return {
    note: campus?.homeNote
      ? renderAuthoredMarkdown(
          campus.homeNote.markdown,
          new Map(
            campus.homeNote.images.map((image) => [
              image.sourceUrl,
              shownPicture(image),
            ]),
          ),
        )
      : null,
    highlight:
      highlight && isHighlightOpen(highlight.date, campus.timezone, now)
        ? {
            ...highlight,
            date: dbDateToKey(highlight.date),
            image: highlight.image && shownPicture(highlight.image),
          }
        : null,
  };
}
