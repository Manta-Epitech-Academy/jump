/**
 * What a talent's home shows of their campus: « le mot du campus », the one
 * message of its Actualité card, and what the campus puts forward (an event of
 * its own to sign up for, and a generic invitation).
 *
 * All are authored campus by campus over the admin API
 * (`adminApi/writes/talentHome.ts`, `write_event_config` for the event's own
 * words), never derived; this reads them for the campus the request hooks
 * resolved, renders the note through `renderAuthoredMarkdown`, drawing each
 * picture it names from Jump's copy and never from the address written, and
 * keeps the highlighted event only while it still shows (`pointedEventShown`:
 * still this campus's, named, with a sign-up form, and still inviting). What the home's blue hero then
 * suggests is one pure rule, `pickHomeHero` in `domain/talentHome.ts`.
 */
import { prisma } from '$lib/server/db';
import type { ShownPicture } from '$lib/domain/pictures';
import { renderAuthoredMarkdown } from '$lib/markdown';
import { toDateKey } from '$lib/domain/planningTime';
import {
  talentHomeImageUrl,
  pointedEventShown,
  type HighlightedEvent,
  type TalentHome,
} from '$lib/domain/talentHome';
import { shownEventHeroPicture } from './eventHeroImages';

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

const PICTURE_SELECT = {
  key: true,
  stillKey: true,
  width: true,
  height: true,
} as const;

/**
 * What a talent's home shows of their campus: its note, rendered, and what it
 * puts forward: its event while it still invites, its generic invitation.
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
      name: true,
      timezone: true,
      homeNote: {
        select: {
          markdown: true,
          images: { select: { sourceUrl: true, ...PICTURE_SELECT } },
        },
      },
      homeHighlight: {
        select: {
          title: true,
          text: true,
          url: true,
          buttonLabel: true,
          image: { select: PICTURE_SELECT },
          event: {
            select: {
              id: true,
              publicName: true,
              date: true,
              endDate: true,
              startMinutes: true,
              signupUrl: true,
              campusId: true,
              devActivatedAt: true,
              modules: { select: { moduleKey: true } },
              category: { select: { color: true } },
              heroes: {
                where: { stage: 'invitation' },
                select: {
                  title: true,
                  text: true,
                  buttonLabel: true,
                  image: { select: PICTURE_SELECT },
                },
              },
            },
          },
        },
      },
    },
  });
  const row = campus?.homeHighlight;

  let event: HighlightedEvent | null = null;
  const pointed = row?.event;
  // The event's campus is checked here rather than bound by a key
  // (`TalentHome_Highlight.eventId`): Salesforce may have moved it since.
  const shown =
    campus && pointed
      ? pointedEventShown(campusId, campus.timezone, pointed, now)
      : null;
  if (campus && pointed && shown?.shown) {
    const written = pointed.heroes[0] ?? null;
    event = {
      id: pointed.id,
      name: shown.name,
      date: toDateKey(pointed.date, campus.timezone),
      endDate: pointed.endDate && toDateKey(pointed.endDate, campus.timezone),
      startMinutes: pointed.startMinutes,
      campusName: campus.name,
      timezone: campus.timezone,
      categoryColor: pointed.category?.color ?? null,
      signupUrl: shown.signupUrl,
      copy: written && {
        title: written.title,
        text: written.text,
        buttonLabel: written.buttonLabel,
      },
      image: written?.image ? shownEventHeroPicture(written.image) : null,
    };
  }
  const invitation =
    row?.title != null && row.text != null && row.url != null
      ? {
          title: row.title,
          text: row.text,
          url: row.url,
          buttonLabel: row.buttonLabel,
          image: row.image && shownPicture(row.image),
        }
      : null;

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
    highlight: event || invitation ? { event, invitation } : null,
  };
}
