import { toDateKey, type DateKey } from './planningTime';
import { dateKeyToDbDate, dbDateToKey } from './eventPresence';

// What a campus puts on its talents' home besides their own enrolments: « le
// mot du campus » and one event to sign up for. Both are typed by hand over the
// admin API, campus by campus; this module holds the rules the writer and the
// reader share, so the two cannot disagree on a limit or on a day.

/** Long enough for a rentrée message with a few dates and links. */
export const TALENT_HOME_NOTE_MAX = 1500;
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
  image: { url: string; width: number; height: number } | null;
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
 * Where a highlight's picture lives once copied, and the URL a page asks for it
 * at. Composed here and nowhere else, because the proxy route turns its two
 * path segments back into the key and the two directions must not drift. The
 * key is content-addressed, so a new picture is a new URL and the proxy can
 * cache one forever.
 */
const IMAGE_PREFIX = 'talent-home';

export function highlightImageKey(
  campusId: string,
  digest: string,
  extension: string,
): string {
  return `${IMAGE_PREFIX}/${campusId}/highlight-${digest}.${extension}`;
}

/** The key the proxy route's `[campusId]/[file]` segments name. */
export function highlightImageKeyFromPath(
  campusId: string,
  file: string,
): string {
  return `${IMAGE_PREFIX}/${campusId}/${file}`;
}

export function highlightImageUrl(key: string): string {
  return `/api/talent-home/images/${key.slice(IMAGE_PREFIX.length + 1)}`;
}
