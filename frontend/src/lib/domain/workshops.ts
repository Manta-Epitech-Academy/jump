import type { EventLifecycleStatus } from './eventLifecycle';
import type { ShownPicture } from './pictures';

/**
 * How a workshop XP grant is addressed.
 *
 * ONE `XpGrant` per (talent, activity), recomputed on every progress callback
 * rather than appended per validated step, so the talent's timeline carries one
 * line instead of thirty (several of them at "+0 XP") and the rounded total is
 * exactly `budgetMinutes * WORKSHOP_XP_PER_MINUTE`. `grantXp` upserts on
 * `(source, sourceId)`, so a replay writes the same value and a correction
 * repairs in place.
 *
 * The id is the activity slug and the talent, in that order, because the slug is
 * the stable natural key and is never renamed. It is the activity's and not its
 * host's because a host serves one content after another: keyed on the host, a
 * new content's progress replaced the previous one's XP. It is composed and
 * parsed here, and nowhere else: the XP timeline resolves an activity's label by
 * reading the slug back out of it.
 */

const SEPARATOR = ':';

export function workshopGrantSourceId(
  activitySlug: string,
  talentId: string,
): string {
  return `${activitySlug}${SEPARATOR}${talentId}`;
}

/** The slug back out of a `workshop` grant's `sourceId`, or null if it is malformed. */
export function workshopSlugFromSourceId(
  sourceId: string | null | undefined,
): string | null {
  if (!sourceId) return null;
  const slug = sourceId.split(SEPARATOR)[0];
  return slug ? slug : null;
}

/**
 * Where a cover picture lives once copied, and the URL a page asks for it at.
 *
 * Composed here and nowhere else, because the proxy route turns its two path
 * segments back into the key and the two directions must not drift.
 *
 * A key is minted by the write that copies the picture (`writeId`) and names
 * those bytes only: a later write that restates the same address keeps it, and
 * one that gives another address mints a new key. That is what lets the proxy
 * cache a picture forever, and what lets each key have exactly one party that
 * may delete it (`images/remote.ts`, `replacePictures`).
 */
export type WorkshopCoverKind = 'media' | 'poster' | 'mascot';

const COVER_PREFIX = 'workshops';

export function workshopCoverKey(
  activityId: string,
  kind: WorkshopCoverKind,
  writeId: string,
  extension: string,
): string {
  return `${COVER_PREFIX}/${activityId}/${kind}-${writeId}.${extension}`;
}

/** The key the proxy route's `[activityId]/[file]` segments name. */
export function workshopCoverKeyFromPath(
  activityId: string,
  file: string,
): string {
  return `${COVER_PREFIX}/${activityId}/${file}`;
}

export function workshopCoverUrl(key: string): string {
  return `/api/workshops/covers/${key.slice(COVER_PREFIX.length + 1)}`;
}

/**
 * Which activities a talent is offered, through which enrolment, and which of
 * them are today's.
 *
 * An activity is offered once the event offering it has STARTED (its first
 * campus day), and from then on for good: a Coding Club is designed never to
 * finish, and the students carry on at home in the evening and the days after.
 * Before that day it is neither shown nor enterable, so nobody starts a camp's
 * subject a week early. The one exception is a talent who has already walked
 * it: what they started stays theirs, even when the only enrolment still
 * offering it is for an event to come.
 *
 * An activity offered by several of a talent's enrolments resolves to ONE
 * offering: the event running today when there is one (that is the one the
 * day's hero is about), otherwise the most recent that has started, and only
 * failing both a future one the talent is already walking it through. The chosen
 * enrolment is what a first entry pins its event, campus and minute budget on,
 * so two events of the same day and phase are told apart by id rather than left
 * to whatever order the rows arrived in.
 *
 * Ordered newest event first, then by the event's own order, which is the order
 * a talent reads them in. Two events of the same day are kept apart, by id, so
 * the list reads the same on every load.
 *
 * Pure: the caller computes each event's status in its campus timezone.
 */
export function selectWorkshopOfferings<
  T extends {
    activityId: string;
    eventId: string;
    eventDate: Date;
    position: number;
    status: EventLifecycleStatus;
  },
>(
  rows: readonly T[],
  startedActivityIds: ReadonlySet<string>,
): (T & { today: boolean })[] {
  const chosen = new Map<string, T>();
  for (const row of rows) {
    if (row.status === 'upcoming' && !startedActivityIds.has(row.activityId))
      continue;
    const current = chosen.get(row.activityId);
    if (!current || outranks(row, current)) chosen.set(row.activityId, row);
  }
  return [...chosen.values()]
    .map((row) => ({ ...row, today: row.status === 'ongoing' }))
    .sort(
      (a, b) =>
        b.eventDate.getTime() - a.eventDate.getTime() ||
        a.eventId.localeCompare(b.eventId) ||
        a.position - b.position,
    );
}

/**
 * Today's event over any other, then one that has run over one still to come
 * (which only survives at all for a talent who already started the activity),
 * then the most recent, then the lower id.
 */
const PHASE_RANK: Record<EventLifecycleStatus, number> = {
  ongoing: 2,
  past: 1,
  upcoming: 0,
};

type Ranked = {
  eventId: string;
  eventDate: Date;
  status: EventLifecycleStatus;
};

function outranks(a: Ranked, b: Ranked): boolean {
  const byPhase = PHASE_RANK[a.status] - PHASE_RANK[b.status];
  if (byPhase !== 0) return byPhase > 0;
  const byDate = a.eventDate.getTime() - b.eventDate.getTime();
  if (byDate !== 0) return byDate > 0;
  return a.eventId < b.eventId;
}

/**
 * What the talent dashboard renders of the activities: the view a page reads,
 * built server-side by `listTalentWorkshops`.
 */
export type WorkshopCoverImage = ShownPicture;

export type WorkshopActivity = {
  slug: string;
  /** What the talent reads: the event's own wording when it set one. */
  label: string;
  solvedSteps: number;
  totalSteps: number;
  /** Null until the talent has entered once. */
  startedAt: Date | null;
  /**
   * How the activity presents itself, authored over the API. Every part is
   * optional: with none, the activity stands on its label.
   */
  cover: {
    tagline: string | null;
    media: WorkshopCoverImage | null;
    poster: WorkshopCoverImage | null;
    mascot: WorkshopCoverImage | null;
  };
};

/**
 * Whether the talent has walked an activity to its end. An activity whose step
 * count CTFd has not reported yet (`totalSteps` 0) is never finished: nothing
 * says there is no step left.
 */
export function isActivityFinished(
  activity: Pick<WorkshopActivity, 'solvedSteps' | 'totalSteps'>,
): boolean {
  return activity.totalSteps > 0 && activity.solvedSteps >= activity.totalSteps;
}

/**
 * The activities a talent still has to walk, as « Mon parcours » lists them:
 * the unfinished ones, those already entered first (the most recently entered
 * leading, since that is the one they are most likely to pick up again), then
 * those never opened, in the order they were given.
 */
export function activitiesToDo(
  activities: WorkshopActivity[],
): WorkshopActivity[] {
  const entered = (a: WorkshopActivity) => a.startedAt?.getTime() ?? -Infinity;
  return activities
    .filter((activity) => !isActivityFinished(activity))
    .sort((a, b) => entered(b) - entered(a));
}

export type TalentWorkshops = {
  /**
   * The activities of the events running today, for the dashboard's hero.
   * Empty on any day none of the talent's events offering one is running.
   */
  today: WorkshopActivity[];
  /** Every other activity the talent has been offered, newest event first. */
  activities: WorkshopActivity[];
};
