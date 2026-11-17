import { dateKeyParts } from './eventPresence';
import { eventPublicName, UNNAMED_EVENT_NAME } from './event';
import type { DateKey } from './planningTime';
import { heroEventPhase } from './talentHome';
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

export type ParcoursActivity = {
  slug: string;
  label: string;
  /** XP it earned; null for an activity not started yet. */
  xp: number | null;
  /** Null once finished, or when it is no longer offered. */
  action: ParcoursActivityAction | null;
};

/**
 * Where a step stands: `past` once over, `live` while it runs, `upcoming`
 * before. Read like the home hero, so the two never disagree on the day.
 */
export type ParcoursPhase = 'past' | 'live' | 'upcoming';

export type ParcoursEvent = {
  id: string;
  name: string;
  /** « 04/04/26 », « 15-26/06/26 » (`parcoursDaysLabel`). */
  days: string;
  phase: ParcoursPhase;
  /** Its category's `#rrggbb`; null when it has none. */
  color: string | null;
  keyEvent: boolean;
  activities: ParcoursActivity[];
};

export type Parcours = {
  /** What is running, then what comes next, soonest first. */
  ahead: ParcoursEvent[];
  /** What is over, newest first. */
  past: ParcoursEvent[];
};

/**
 * The days an event ran, short, as the mockup writes them down a timeline:
 * « 04/04/26 », « 15-26/06/26 », « 30/06-02/07/26 », « 29/12/26-02/01/27 ».
 * Read off the keys, so no clock can shift a day.
 */
export function parcoursDaysLabel(
  date: DateKey,
  endDate: DateKey | null,
): string {
  const two = (n: number) => String(n).padStart(2, '0');
  const from = dateKeyParts(date);
  const day = (p: { day: number }) => two(p.day);
  const dayMonth = (p: { day: number; month: number }) =>
    `${two(p.day)}/${two(p.month)}`;
  const full = (p: { day: number; month: number; year: number }) =>
    `${dayMonth(p)}/${two(p.year % 100)}`;
  if (!endDate || endDate === date) return full(from);
  const to = dateKeyParts(endDate);
  if (from.year !== to.year) return `${full(from)}-${full(to)}`;
  if (from.month !== to.month) return `${dayMonth(from)}-${full(to)}`;
  return `${day(from)}-${full(to)}`;
}

/**
 * Arrange a talent's journey.
 *
 * - `events` holds every event a step may name, keyed by id; a step is drawn
 *   only for an event in `attended` or `enrolled`, or one an activity below
 *   belongs to.
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
      action: still && !isActivityFinished(still) ? 'continue' : null,
    });
  }
  for (const activity of offered) {
    if (shown.has(activity.slug) || isActivityFinished(activity)) continue;
    shown.add(activity.slug);
    add(activity.eventId, {
      slug: activity.slug,
      label: activity.label,
      xp: null,
      action: activity.startedAt ? 'continue' : 'start',
    });
  }

  const ids = new Set([...attended, ...enrolled, ...activitiesOf.keys()]);
  const steps: (ParcoursEvent & { facts: ParcoursEventFacts })[] = [];
  for (const id of ids) {
    const facts = events.get(id);
    if (!facts) continue;
    const phase = heroEventPhase(facts, now, false);
    steps.push({
      facts,
      id,
      name: eventPublicName(facts) ?? UNNAMED_EVENT_NAME,
      days: parcoursDaysLabel(facts.date, facts.endDate),
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

  return {
    ahead: steps
      .filter((s) => s.phase !== 'past')
      .sort(
        (a, b) =>
          Number(b.phase === 'live') - Number(a.phase === 'live') ||
          byStart(a.facts, b.facts),
      )
      .map(strip),
    past: steps
      .filter((s) => s.phase === 'past')
      .sort((a, b) => byStart(b.facts, a.facts))
      .map(strip),
  };
}
