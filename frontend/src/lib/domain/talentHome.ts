import { fromWallClock, toDateKey, type DateKey } from './planningTime';
import { dateKeyParts, dateKeyToDbDate } from './eventPresence';
import { minutesToHHMM } from './event';
import { isActivityFinished, type WorkshopActivity } from './workshops';
import {
  heroCopy,
  HERO_DEFAULT_BUTTON,
  type HeroCopy,
  type HeroCopyWritten,
} from './eventHero';
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
 * An event as the hero shows it, read on its own campus clock: the days it
 * runs, its arrival time, where it takes place and the colour of its kind for
 * the generated visual.
 */
export type HeroEvent = {
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
  /** Its category's `#rrggbb`, outside the palette on purpose; null for none. */
  categoryColor: string | null;
};

/**
 * The event a campus puts forward, as a talent's home receives it: only while
 * it still invites (`isInvitationOpen`), only on its own campus, and only with
 * a sign-up form. Whether this talent is already enrolled in it is the hero's
 * question, not this one's.
 */
export type HighlightedEvent = HeroEvent & {
  signupUrl: string;
  /** What the event wrote for its invitation stage, null for the defaults. */
  copy: HeroCopyWritten | null;
  /** The invitation stage's picture, served by Jump; null when it has none. */
  image: ShownPicture | null;
};

/**
 * An event the talent is enrolled in (an enrolment the dev space shows, #491)
 * that is not over yet, with what it wrote for the two stages an enrolled
 * talent sees.
 */
export type EnrolledEvent = HeroEvent & {
  /** Whether it has a schedule worth opening (`/calendar`). */
  hasPlanning: boolean;
  enrolled: { copy: HeroCopyWritten | null; image: ShownPicture | null };
  live: { copy: HeroCopyWritten | null };
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
 * suggests now, every day, and what the talent is living through reflected
 * back (#501): never « inscris-toi » to someone already enrolled. Read on each
 * event's own campus clock.
 *
 * In this order, the first that applies:
 *
 *   1. `live`: an event the talent is enrolled in is running and either offers
 *      a subject at this moment or has passed its arrival time. On an event
 *      day the hero is there to reach the subjects and nothing else, so the
 *      campus's next invitation waits for a day without one;
 *   2. `enrolled`: the next event the talent is enrolled in, with how many
 *      days are left and a way to put it in their calendar;
 *   3. `invitation`: the event the campus puts forward, to a talent not
 *      enrolled in it. Once their enrolment arrives from Salesforce the same
 *      talent falls in case 2 without anybody touching anything;
 *   4. `generic`: the campus's standing invitation (« Les Ateliers TECH »);
 *   5. `continue`: a subject the talent started and has not finished, which a
 *      Coding Club is designed for them to carry on at home: the most
 *      recently started first;
 *   6. nothing. The hero is not filled for the sake of it, and there is no
 *      « after » stage: once an event is over the next case takes its place.
 */
export type HomeHero =
  | {
      kind: 'live';
      event: EnrolledEvent;
      copy: HeroCopy;
      /** What the event offers at this moment, as equal choices: 0 to n. */
      subjects: WorkshopActivity[];
    }
  | {
      kind: 'enrolled';
      event: EnrolledEvent;
      copy: HeroCopy;
      image: ShownPicture | null;
      /** Campus calendar days until its first day: 0 on that day. */
      countdownDays: number;
    }
  | {
      kind: 'invitation';
      event: HighlightedEvent;
      copy: HeroCopy;
    }
  | {
      kind: 'generic';
      invitation: CampusInvitation;
      buttonLabel: string;
    }
  | { kind: 'continue'; activity: WorkshopActivity };

/** Where an event stands for the hero at an instant, on its campus clock. */
export type HeroEventPhase = 'upcoming' | 'live' | 'ended';

/**
 * `ended` after its last campus day; `live` while it runs once it offers a
 * subject now or its arrival time has passed (midnight when it has none);
 * `upcoming` otherwise, which includes the morning of its first day before the
 * talent is expected.
 */
export function heroEventPhase(
  event: Pick<HeroEvent, 'date' | 'endDate' | 'startMinutes' | 'timezone'>,
  now: Date,
  offersSubjectNow: boolean,
): HeroEventPhase {
  const today = toDateKey(now, event.timezone);
  if (today > (event.endDate ?? event.date)) return 'ended';
  if (today < event.date) return 'upcoming';
  if (offersSubjectNow) return 'live';
  const arrival = fromWallClock(
    event.date,
    minutesToHHMM(event.startMinutes) || '00:00',
    event.timezone,
  );
  return now >= arrival ? 'live' : 'upcoming';
}

/** Whole campus calendar days from one day to another (negative if before). */
export function calendarDaysBetween(from: DateKey, to: DateKey): number {
  const DAY_MS = 86_400_000;
  return Math.round(
    (dateKeyToDbDate(to).getTime() - dateKeyToDbDate(from).getTime()) / DAY_MS,
  );
}

/** The hero's countdown pill: « J-3 », or « Aujourd’hui » on the day. */
export function countdownLabel(days: number): string {
  return days > 0 ? `J-${days}` : 'Aujourd’hui';
}

const MONTH_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  timeZone: 'UTC',
});
const WEEKDAY_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  timeZone: 'UTC',
});

/**
 * The days an event runs, the way the hero says them to a talent: « Mardi 27
 * octobre », « Du 27 au 30 octobre », « Du 30 octobre au 2 novembre ». The
 * year only when it is not the current one on the campus clock (`today`).
 * Read off the keys, so no clock can shift a day.
 */
export function heroDaysLabel(
  date: DateKey,
  endDate: DateKey | null,
  today: DateKey,
): string {
  const part = (key: DateKey) => {
    const { year, day } = dateKeyParts(key);
    return {
      year,
      day: day === 1 ? '1er' : String(day),
      month: MONTH_FORMAT.format(dateKeyToDbDate(key)),
    };
  };
  const currentYear = dateKeyParts(today).year;
  const start = part(date);
  const end = part(endDate ?? date);
  const year = (p: { year: number }) =>
    p.year === currentYear ? '' : ` ${p.year}`;
  if (date === (endDate ?? date)) {
    const weekday = WEEKDAY_FORMAT.format(dateKeyToDbDate(date));
    return `${weekday[0].toUpperCase()}${weekday.slice(1)} ${start.day} ${start.month}${year(start)}`;
  }
  if (start.year !== end.year) {
    return `Du ${start.day} ${start.month}${year(start)} au ${end.day} ${end.month}${year(end)}`;
  }
  if (start.month !== end.month) {
    return `Du ${start.day} ${start.month} au ${end.day} ${end.month}${year(end)}`;
  }
  return `Du ${start.day} au ${end.day} ${end.month}${year(end)}`;
}

/** « 10h00 », the arrival time as the hero writes it; null when none was set. */
export function arrivalLabel(startMinutes: number | null): string | null {
  const hhmm = minutesToHHMM(startMinutes);
  return hhmm ? hhmm.replace(':', 'h') : null;
}

export function pickHomeHero({
  now,
  enrolled,
  subjectsNow,
  highlight,
  activities,
}: {
  now: Date;
  /** The talent's shown enrolments whose event is not over. */
  enrolled: EnrolledEvent[];
  /** The subjects offered right now (`TalentWorkshops.today`). */
  subjectsNow: WorkshopActivity[];
  /** What the campus puts forward, as `getTalentHome` reads it. */
  highlight: TalentHomeHighlight | null;
  /** Every other subject offered (`TalentWorkshops.activities`). */
  activities: WorkshopActivity[];
}): HomeHero | null {
  const subjectsOf = (event: EnrolledEvent) =>
    subjectsNow.filter((subject) => subject.eventId === event.id);
  const byStart = (a: HeroEvent, b: HeroEvent) =>
    a.date.localeCompare(b.date) ||
    (a.startMinutes ?? 0) - (b.startMinutes ?? 0) ||
    a.id.localeCompare(b.id);

  const phased = enrolled.map((event) => {
    const subjects = subjectsOf(event);
    return {
      event,
      subjects,
      phase: heroEventPhase(event, now, subjects.length > 0),
    };
  });

  const live = phased
    .filter((p) => p.phase === 'live')
    .sort(
      (a, b) =>
        Number(b.subjects.length > 0) - Number(a.subjects.length > 0) ||
        byStart(a.event, b.event),
    )[0];
  if (live) {
    return {
      kind: 'live',
      event: live.event,
      copy: heroCopy('live', live.event.live.copy, live.event),
      subjects: live.subjects,
    };
  }

  const next = phased
    .filter((p) => p.phase === 'upcoming')
    .sort((a, b) => byStart(a.event, b.event))[0];
  if (next) {
    const { event } = next;
    return {
      kind: 'enrolled',
      event,
      copy: heroCopy('enrolled', event.enrolled.copy, event),
      image: event.enrolled.image,
      countdownDays: calendarDaysBetween(
        toDateKey(now, event.timezone),
        event.date,
      ),
    };
  }

  const pointed = highlight?.event;
  if (pointed && !enrolled.some((event) => event.id === pointed.id)) {
    return {
      kind: 'invitation',
      event: pointed,
      copy: heroCopy('invitation', pointed.copy, pointed),
    };
  }

  if (highlight?.invitation) {
    return {
      kind: 'generic',
      invitation: highlight.invitation,
      buttonLabel:
        highlight.invitation.buttonLabel ?? HERO_DEFAULT_BUTTON.invitation,
    };
  }

  const inProgress = [...subjectsNow, ...activities]
    .filter((a) => a.startedAt !== null && !isActivityFinished(a))
    .sort((a, b) => b.startedAt!.getTime() - a.startedAt!.getTime());
  return inProgress[0] ? { kind: 'continue', activity: inProgress[0] } : null;
}
