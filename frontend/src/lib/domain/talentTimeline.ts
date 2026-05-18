import {
  applyPhaseOverride,
  getEventStatus,
  getLifecycleBounds,
  type EventLifecycleStatus,
} from './eventLifecycle';

/**
 * Buckets a talent's participations into past / current / future, using the
 * same lifecycle rules as the event detail page so the talent profile agrees
 * with the dashboard about what phase a stage is in.
 *
 * Ordering inside each group is chronological-reading: past and current are
 * desc (most recent first), future is asc (next thing first).
 */

export type TimelineGroups<T> = {
  past: T[];
  current: T[];
  future: T[];
};

type ParticipationLike = {
  event: { date: Date; endDate: Date | null };
};

export function groupParticipations<T extends ParticipationLike>(
  participations: T[],
  timezone: string,
  phaseOverride: EventLifecycleStatus | null | undefined,
): TimelineGroups<T> {
  const bounds = getLifecycleBounds(timezone);
  const past: T[] = [];
  const current: T[] = [];
  const future: T[] = [];

  for (const p of participations) {
    const status = applyPhaseOverride(
      getEventStatus(p.event, bounds),
      phaseOverride,
    );
    if (status === 'ongoing') current.push(p);
    else if (status === 'upcoming') future.push(p);
    else past.push(p);
  }

  const byDateDesc = (a: T, b: T) =>
    b.event.date.getTime() - a.event.date.getTime();
  const byDateAsc = (a: T, b: T) =>
    a.event.date.getTime() - b.event.date.getTime();

  past.sort(byDateDesc);
  current.sort(byDateDesc);
  future.sort(byDateAsc);

  return { past, current, future };
}
