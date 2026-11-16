import { toDateKey, type DateKey } from './planningTime';
import { isActivityFinished, type WorkshopActivity } from './workshops';
import type { HeroCopyWritten } from './eventHero';
import type { ShownPicture } from './pictures';

// What a campus puts on its talents' home besides their own enrolments: « le
// mot du campus », and what it puts forward (an event of its own, a generic
// invitation, or both). All typed by hand over the admin API, campus by campus;
// this module holds the rules the writer and the reader share, so the two
// cannot disagree on a limit or on a day, and the rule that decides what the
// home's hero suggests. The hero's own limits are an event's too, and live with
// them (`HERO_TITLE_MAX`... in `eventHero.ts`).

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

/**
 * The event a campus puts forward, as a talent's home receives it: only while
 * it still invites (`isInvitationOpen`), only on its own campus, and only with
 * a sign-up form. Whether this talent is already enrolled in it is the hero's
 * question, not this one's.
 */
export type HighlightedEvent = {
  id: string;
  /** `eventDisplayName`: its public name, else its Salesforce one. */
  name: string;
  /** Its first and last day on the campus clock; `endDate` null for one day. */
  date: DateKey;
  endDate: DateKey | null;
  /** Arrival time, minutes from campus midnight; null when none was set. */
  startMinutes: number | null;
  /** Where it takes place: the only place Jump holds is its campus. */
  campusName: string;
  timezone: string;
  signupUrl: string;
  /** What the event wrote for its invitation stage, null for the defaults. */
  copy: HeroCopyWritten | null;
  /** The invitation stage's picture, served by Jump; null when it has none. */
  image: ShownPicture | null;
};

/** A campus's generic invitation (« Les Ateliers TECH, toute l'année »). */
export type CampusInvitation = {
  title: string;
  text: string;
  url: string;
  /** Null shows the mockup's « Je m'inscris ». */
  buttonLabel: string | null;
  image: ShownPicture | null;
};

/** What a campus puts forward, as a talent's home receives it. */
export type TalentHomeHighlight = {
  event: HighlightedEvent | null;
  invitation: CampusInvitation | null;
};

export type TalentHome = {
  /** The campus note, already rendered and sanitised. */
  note: string | null;
  /** Null when the campus puts nothing forward that still shows. */
  highlight: TalentHomeHighlight | null;
};

/**
 * Whether a highlighted event still invites anyone to sign up: until the end of
 * its first day on the campus clock. Past that, signing up for a camp already
 * under way makes little sense, and the campus's generic invitation takes over.
 * `date` is the event's start, stored at midnight campus time, so it is read as
 * a day on that same clock.
 */
export function isInvitationOpen(
  event: { date: Date },
  timezone: string,
  now: Date,
): boolean {
  return toDateKey(event.date, timezone) >= toDateKey(now, timezone);
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
 *   1. an activity offered today: the day's activity, and only it. On an
 *      event day the talent came to do that activity, so the campus's
 *      highlighted event waits for a day without one rather than sharing the
 *      hero with it;
 *   2. the campus's generic invitation (the event it points at waits for the
 *      enrolment-aware hero, #501);
 *   3. an activity the talent started and has not finished, which a Coding
 *      Club is designed for them to carry on at home: the most recently
 *      started first;
 *   4. nothing. The hero is not filled for the sake of it.
 */
export type HomeHero =
  | { kind: 'activity'; activities: WorkshopActivity[] }
  | { kind: 'highlight'; invitation: CampusInvitation }
  | { kind: 'continue'; activity: WorkshopActivity };

export function pickHomeHero({
  today,
  highlight,
  activities,
}: {
  /** The activities offered today (`TalentWorkshops.today`). */
  today: WorkshopActivity[];
  /** What the campus puts forward, as `getTalentHome` reads it. */
  highlight: TalentHomeHighlight | null;
  /** Every other activity offered (`TalentWorkshops.activities`). */
  activities: WorkshopActivity[];
}): HomeHero | null {
  if (today.length > 0) return { kind: 'activity', activities: today };
  if (highlight?.invitation)
    return { kind: 'highlight', invitation: highlight.invitation };
  const inProgress = activities
    .filter((a) => a.startedAt !== null && !isActivityFinished(a))
    .sort((a, b) => b.startedAt!.getTime() - a.startedAt!.getTime());
  return inProgress[0] ? { kind: 'continue', activity: inProgress[0] } : null;
}
