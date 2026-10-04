import type { EventLifecycleStatus } from './eventLifecycle';

/**
 * How a workshop XP grant is addressed.
 *
 * ONE `XpGrant` per (talent, instance), recomputed on every progress callback
 * rather than appended per validated step, so the talent's timeline carries one
 * line instead of thirty (several of them at "+0 XP") and the rounded total is
 * exactly `budgetMinutes * WORKSHOP_XP_PER_MINUTE`. `grantXp` upserts on
 * `(source, sourceId)`, so a replay writes the same value and a correction
 * repairs in place.
 *
 * The id is the instance slug and the talent, in that order, because the slug is
 * the stable natural key and is never renamed. It is composed and parsed here,
 * and nowhere else: the XP timeline resolves an activity's label by reading the
 * slug back out of it.
 */

const SEPARATOR = ':';

export function workshopGrantSourceId(
  instanceSlug: string,
  talentId: string,
): string {
  return `${instanceSlug}${SEPARATOR}${talentId}`;
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
 * Where a copied cover picture lives, and the URL a page asks for it at.
 *
 * Composed here and nowhere else, because the proxy route turns its two path
 * segments back into the key and the two directions must not drift. The key is
 * content-addressed (`digest` is a hash of the stored bytes), which is what lets
 * the proxy cache a picture forever: new bytes are a new key.
 */
export type WorkshopCoverKind = 'media' | 'poster' | 'mascot';

const COVER_PREFIX = 'workshops';

export function workshopCoverKey(
  instanceId: string,
  kind: WorkshopCoverKind,
  digest: string,
  extension: string,
): string {
  return `${COVER_PREFIX}/${instanceId}/${kind}-${digest}.${extension}`;
}

/** The key the proxy route's `[instanceId]/[file]` segments name. */
export function workshopCoverKeyFromPath(
  instanceId: string,
  file: string,
): string {
  return `${COVER_PREFIX}/${instanceId}/${file}`;
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
 * it: what they started stays theirs, whatever their enrolments say now.
 *
 * An instance offered by several of a talent's enrolments resolves to ONE
 * offering: the event running today when there is one (that is the one the
 * day's hero is about), otherwise the most recent that has started, and only
 * failing both a future one the talent is already walking it through. The chosen
 * enrolment is what a first entry pins its event, campus and minute budget on.
 *
 * Ordered newest event first, then by the event's own order, which is the order
 * a talent reads them in.
 *
 * Pure: the caller computes each event's status in its campus timezone.
 */
export function selectWorkshopOfferings<
  T extends {
    instanceId: string;
    eventDate: Date;
    position: number;
    status: EventLifecycleStatus;
  },
>(
  rows: readonly T[],
  startedInstanceIds: ReadonlySet<string>,
): (T & { today: boolean })[] {
  const chosen = new Map<string, T>();
  for (const row of rows) {
    if (row.status === 'upcoming' && !startedInstanceIds.has(row.instanceId))
      continue;
    const current = chosen.get(row.instanceId);
    if (!current || outranks(row, current)) chosen.set(row.instanceId, row);
  }
  return [...chosen.values()]
    .map((row) => ({ ...row, today: row.status === 'ongoing' }))
    .sort(
      (a, b) =>
        b.eventDate.getTime() - a.eventDate.getTime() ||
        a.position - b.position,
    );
}

/**
 * Today's event over any other, then one that has run over one still to come
 * (which only survives at all for a talent who already started the activity),
 * then the most recent.
 */
const PHASE_RANK: Record<EventLifecycleStatus, number> = {
  ongoing: 2,
  past: 1,
  upcoming: 0,
};

function outranks(
  a: { eventDate: Date; status: EventLifecycleStatus },
  b: { eventDate: Date; status: EventLifecycleStatus },
): boolean {
  const byPhase = PHASE_RANK[a.status] - PHASE_RANK[b.status];
  if (byPhase !== 0) return byPhase > 0;
  return a.eventDate.getTime() > b.eventDate.getTime();
}

/**
 * What the talent dashboard renders of the activities: the view a page reads,
 * built server-side by `listTalentWorkshops`.
 */
export type WorkshopCoverImage = { url: string; width: number; height: number };

export type WorkshopActivity = {
  slug: string;
  /** What the talent reads: the event's own wording when it set one. */
  label: string;
  solvedSteps: number;
  totalSteps: number;
  /** Null until the talent has entered once. */
  startedAt: Date | null;
  /** What the subject says about itself, copied from the instance; null until read. */
  cover: {
    tagline: string | null;
    media: WorkshopCoverImage | null;
    poster: WorkshopCoverImage | null;
    mascot: WorkshopCoverImage | null;
  } | null;
};

export type TalentWorkshops = {
  /**
   * The activities of the events running today, for the dashboard's hero.
   * Empty on any day none of the talent's events offering one is running.
   */
  today: WorkshopActivity[];
  /** Every other activity the talent has been offered, newest event first. */
  activities: WorkshopActivity[];
};
