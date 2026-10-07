import { toDateKey, type DateKey } from './planningTime';
import { dateKeyToDbDate, dbDateToKey } from './eventPresence';
import { isActivityFinished, type WorkshopActivity } from './workshops';
import type { ShownPicture } from './pictures';

// What a campus puts on its talents' home besides their own enrolments: « le
// mot du campus » and one event to sign up for. Both are typed by hand over the
// admin API, campus by campus; this module holds the rules the writer and the
// reader share, so the two cannot disagree on a limit or on a day, and the rule
// that decides what the home's hero suggests.

/**
 * Long enough for a rentrée message with a few dates and links. Counted on the
 * text the author wrote, not on the addresses of its pictures, which are as
 * long as their host makes them and which a talent never reads.
 */
export const TALENT_HOME_NOTE_MAX = 1500;
/**
 * Pictures in one note. Far past what a message needs, and what bounds the
 * downloads a single write makes and what a talent's phone loads with the home.
 */
export const TALENT_HOME_NOTE_MAX_IMAGES = 10;
export const HIGHLIGHT_TITLE_MAX = 80;
/** The PO's own figure: a line or two under the title, never an article. */
export const HIGHLIGHT_SUMMARY_MAX = 300;

/** The highlighted event as a talent's home receives it. */
export type TalentHomeHighlight = {
  title: string;
  summary: string;
  /** The event's calendar day. */
  date: DateKey;
  url: string;
  /** Its picture, served by Jump; null when it has none. */
  image: ShownPicture | null;
};

export type TalentHome = {
  /** The campus note, already rendered and sanitised. */
  note: string | null;
  highlight: TalentHomeHighlight | null;
};

/**
 * Whether a highlight still invites anyone: until the end of its day on the
 * campus clock. The day is a stored calendar day (`@db.Date`), compared as a
 * key so no timezone can shift it.
 */
export function isHighlightOpen(
  day: Date,
  timezone: string,
  now: Date,
): boolean {
  return dbDateToKey(day) >= toDateKey(now, timezone);
}

/** « mercredi 7 octobre », read off the key itself so no clock can shift it. */
export function formatHighlightDay(key: DateKey): string {
  return dateKeyToDbDate(key).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/**
 * Where a campus's home pictures live once copied (its highlight's, its note's),
 * and the URL a page asks for one at. Composed here and nowhere else, because the proxy route turns its two
 * path segments back into the key and the two directions must not drift. A key
 * is minted by the write that copies the picture and names those bytes only,
 * so a new picture is a new URL and the proxy can cache one forever
 * (`images/remote.ts`, `replacePictures`).
 */
const IMAGE_PREFIX = 'talent-home';

export function highlightImageKey(
  campusId: string,
  writeId: string,
  extension: string,
): string {
  return `${IMAGE_PREFIX}/${campusId}/highlight-${writeId}.${extension}`;
}

/** A picture of the campus note, the `index`-th of the write that copied it. */
export function noteImageKey(
  campusId: string,
  writeId: string,
  index: number,
  extension: string,
): string {
  return `${IMAGE_PREFIX}/${campusId}/note-${writeId}-${index}.${extension}`;
}

/** The key the proxy route's `[campusId]/[file]` segments name. */
export function talentHomeImageKeyFromPath(
  campusId: string,
  file: string,
): string {
  return `${IMAGE_PREFIX}/${campusId}/${file}`;
}

export function talentHomeImageUrl(key: string): string {
  return `/api/talent-home/images/${key.slice(IMAGE_PREFIX.length + 1)}`;
}

/**
 * What the blue hero at the head of a talent's home shows: the one thing Jump
 * suggests doing now. Every day, and never more than one thing, because the
 * hero is « where Jump tells you what to do » and a second suggestion of the
 * same weight would make the talent choose instead of act.
 *
 * In this order, the first that applies:
 *
 *   1. an activity offered today: the day's activity, with the campus's
 *      highlighted event as a compact line under it (« À venir »), since an
 *      invitation still matters on an event day but less than the event;
 *   2. the campus's highlighted event, while its day has not passed;
 *   3. an activity the talent started and has not finished, which a Coding
 *      Club is designed for them to carry on at home: the most recently
 *      started first;
 *   4. nothing. The hero is not filled for the sake of it.
 */
export type HomeHero =
  | {
      kind: 'activity';
      activities: WorkshopActivity[];
      next: TalentHomeHighlight | null;
    }
  | { kind: 'highlight'; highlight: TalentHomeHighlight }
  | { kind: 'continue'; activity: WorkshopActivity };

export function pickHomeHero({
  today,
  highlight,
  activities,
}: {
  /** The activities offered today (`TalentWorkshops.today`). */
  today: WorkshopActivity[];
  /** The campus's highlighted event, already filtered on its day. */
  highlight: TalentHomeHighlight | null;
  /** Every other activity offered (`TalentWorkshops.activities`). */
  activities: WorkshopActivity[];
}): HomeHero | null {
  if (today.length > 0)
    return { kind: 'activity', activities: today, next: highlight };
  if (highlight) return { kind: 'highlight', highlight };
  const inProgress = activities
    .filter((a) => a.startedAt !== null && !isActivityFinished(a))
    .sort((a, b) => b.startedAt!.getTime() - a.startedAt!.getTime());
  return inProgress[0] ? { kind: 'continue', activity: inProgress[0] } : null;
}

/**
 * What « Mes activités » lists under the hero: every activity offered on
 * another day and not finished, except the one the hero already suggests, so
 * no activity is offered twice on one screen. Finished ones are history, and
 * belong to « Mon parcours ».
 */
export function activitiesLeftToDo(
  activities: WorkshopActivity[],
  hero: HomeHero | null,
): WorkshopActivity[] {
  const suggested = hero?.kind === 'continue' ? hero.activity.slug : null;
  return activities.filter(
    (activity) => !isActivityFinished(activity) && activity.slug !== suggested,
  );
}
