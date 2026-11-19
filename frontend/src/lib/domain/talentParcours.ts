import { dateKeyParts } from './eventPresence';
import { eventPublicName, UNNAMED_EVENT_NAME } from './event';
import type { DateKey } from './planningTime';
import { eventDaysLabel, heroEventPhase } from './talentHome';
import { isActivityFinished, type WorkshopActivity } from './workshops';

// « Mon parcours » (#445): a talent's journey told event by event, newest
// first, each event with the activities done there and the XP each earned.
// The loader reads the facts (`server/talent/parcours.ts`); this module holds
// the one rule that arranges them, so it is tested without a database.
//
// Which events make a step is decided upstream and only once: an event the
// talent came to (`attendedBeforeWhere`, the dev space's « venu »), an event
// they are enrolled in that is not over (the home hero's « inscrit »), and an
// event one of their activities belongs to. Every one is an event an admin
// activated: nobody but an admin is shown another.

/** An event as the parcours reads it, on its own campus clock. */
export type ParcoursEventFacts = {
  id: string;
  publicName: string | null;
  /** First and last day on the campus clock; `endDate` null for one day. */
  date: DateKey;
  endDate: DateKey | null;
  startMinutes: number | null;
  timezone: string;
  category: { color: string; keyEvent: boolean } | null;
};

/** XP an activity earned the talent, on the event its walk is pinned to. */
export type ParcoursEarned = {
  eventId: string;
  slug: string;
  label: string;
  xp: number;
};

/** What the talent can do with an activity from the parcours. */
export type ParcoursActivityAction = 'start' | 'continue';

/**
 * An activity the talent can still walk, with what makes it worth walking:
 * the offering itself (`WorkshopActivity`: its cover, its tagline, its steps)
 * and the way in. A finished one is a memory and carries none.
 */
export type ParcoursActivityNext = {
  action: ParcoursActivityAction;
  activity: WorkshopActivity;
};

export type ParcoursActivity = {
  slug: string;
  label: string;
  /** XP it earned; null for an activity not started yet. */
  xp: number | null;
  /** Null once finished, or when it is no longer offered. */
  next: ParcoursActivityNext | null;
};

/**
 * Where a step stands: `past` once over, `live` while it runs, `upcoming`
 * before. Read like the home hero, so the two never disagree on the day.
 */
export type ParcoursPhase = 'past' | 'live' | 'upcoming';

export type ParcoursEvent = {
  id: string;
  name: string;
  /**
   * Its days in the talent's words (`eventDaysLabel`): the year only when it
   * is not the heading's, the weekday only for what is still to live.
   */
  days: string;
  phase: ParcoursPhase;
  /** Its category's `#rrggbb`; null when it has none. */
  color: string | null;
  keyEvent: boolean;
  activities: ParcoursActivity[];
};

/** A stretch of the journey under one year's heading. */
export type ParcoursYear = { year: number; events: ParcoursEvent[] };

/**
 * The journey as one chronology, newest first, each event under the year it
 * begins in: what is to come sits at the top because it is the latest, marked
 * by its phase rather than set apart. A list sorted two ways at once (state,
 * then date) left an event of the current year above that year's heading.
 */
export type Parcours = ParcoursYear[];

/**
 * Arrange a talent's journey.
 *
 * - `events` holds every event a step may name, keyed by id; a step is drawn
 *   only for an event in `attended` or `enrolled`, or one an activity below
 *   belongs to.
 * - `enrolled` names what is to come: once its event is over, an enrolment
 *   alone draws nothing. A visit (`attended`) keeps the step, and so does an
 *   activity under it, done there or still offered by it, since this is the
 *   one place it can be opened from. The loader reads enrolments with slack
 *   past their end (`enrolledNotOverWhere`), so this is where « over » is
 *   decided, on the event's campus clock, as the home hero decides it.
 * - `earned` are the activity XP, each under the event its walk is pinned to.
 * - `offered` are the activities offered to the talent: one with XP shows its
 *   way back in while unfinished, one without any shows under its offering
 *   event as still to do. An activity is shown once.
 */
export function buildParcours({
  now,
  events,
  attended,
  enrolled,
  earned,
  offered,
}: {
  now: Date;
  events: ReadonlyMap<string, ParcoursEventFacts>;
  attended: readonly string[];
  enrolled: readonly string[];
  earned: readonly ParcoursEarned[];
  offered: readonly WorkshopActivity[];
}): Parcours {
  const offeredBySlug = new Map(offered.map((a) => [a.slug, a]));
  const activitiesOf = new Map<string, ParcoursActivity[]>();
  const add = (eventId: string, activity: ParcoursActivity) => {
    if (!events.has(eventId)) return;
    const list = activitiesOf.get(eventId);
    if (list) list.push(activity);
    else activitiesOf.set(eventId, [activity]);
  };

  const shown = new Set<string>();
  for (const grant of earned) {
    if (shown.has(grant.slug)) continue;
    shown.add(grant.slug);
    const still = offeredBySlug.get(grant.slug);
    add(grant.eventId, {
      slug: grant.slug,
      // The event's own wording while it offers it, the catalogue's after.
      label: still?.label ?? grant.label,
      xp: grant.xp,
      next:
        still && !isActivityFinished(still)
          ? { action: 'continue', activity: still }
          : null,
    });
  }
  for (const activity of offered) {
    if (shown.has(activity.slug) || isActivityFinished(activity)) continue;
    shown.add(activity.slug);
    add(activity.eventId, {
      slug: activity.slug,
      label: activity.label,
      xp: null,
      next: { action: activity.startedAt ? 'continue' : 'start', activity },
    });
  }

  const outlivesItsEnd = new Set([...attended, ...activitiesOf.keys()]);
  const ids = new Set([...outlivesItsEnd, ...enrolled]);
  const steps: (ParcoursEvent & { facts: ParcoursEventFacts })[] = [];
  for (const id of ids) {
    const facts = events.get(id);
    if (!facts) continue;
    const phase = heroEventPhase(facts, now, false);
    if (phase === 'ended' && !outlivesItsEnd.has(id)) continue;
    steps.push({
      facts,
      id,
      name: eventPublicName(facts) ?? UNNAMED_EVENT_NAME,
      days: eventDaysLabel(facts.date, facts.endDate, {
        knownYear: dateKeyParts(facts.date).year,
        weekday: phase !== 'ended',
      }),
      phase: phase === 'ended' ? 'past' : phase,
      color: facts.category?.color ?? null,
      keyEvent: facts.category?.keyEvent ?? false,
      activities: activitiesOf.get(id) ?? [],
    });
  }

  const byStart = (a: ParcoursEventFacts, b: ParcoursEventFacts) =>
    a.date.localeCompare(b.date) ||
    (a.startMinutes ?? 0) - (b.startMinutes ?? 0) ||
    a.id.localeCompare(b.id);
  const strip = ({ facts: _facts, ...step }: (typeof steps)[number]) => step;

  const years: ParcoursYear[] = [];
  for (const step of steps.sort((a, b) => byStart(b.facts, a.facts))) {
    const year = dateKeyParts(step.facts.date).year;
    const last = years.at(-1);
    if (last?.year === year) last.events.push(strip(step));
    else years.push({ year, events: [strip(step)] });
  }
  return years;
}
