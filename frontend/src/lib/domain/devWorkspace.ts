import type { EventLifecycleStatus } from './eventLifecycle';
import { reachableSurfaces, type EventSurfaceGates } from './eventModules';

/**
 * The dev workspace's view of one of its events, as both ends of the wire see
 * it: the server passes a `WorkspaceEventEntry`, the browser passes what devalue
 * delivered. Structural on purpose, so neither side has to import the other's
 * type (`$lib/server` must not be reachable from the domain layer).
 *
 * `date` is loose because only ordering reads it, through `new Date(...)`, which
 * takes a `Date` and an ISO string alike.
 *
 * `status` is READ here, never recomputed. It is bucketed server-side by
 * `getEventStatus` against the CAMPUS timezone, and the `endDate` that crosses
 * the wire is not the raw column: `resolveWorkspaceEvents` collapses a null one
 * to the start date for display. Re-deriving the bucket in the browser would
 * therefore read `past` for every single-day event on the very day it runs, and
 * would make this the second implementation of a rule this module exists to
 * hold once. The cost is staleness in a tab left open across midnight, which
 * every other field of the workspace payload shares.
 */
export interface DevWorkspaceEvent extends EventSurfaceGates {
  id: string;
  date: string | Date;
  status: EventLifecycleStatus;
  schoolYear: { label: string; startYear: number };
}

const byDateAsc = (a: DevWorkspaceEvent, b: DevWorkspaceEvent) =>
  new Date(a.date).getTime() - new Date(b.date).getTime();

/** Whether a dev can open this event at all, i.e. it exposes a surface. */
const isNavigable = (e: DevWorkspaceEvent) => reachableSurfaces(e).length > 0;

/**
 * The event a set defaults to: the one in progress, else the soonest to come,
 * else the most recent past one. Null on an empty set.
 *
 * The workspace's own landing and the header's year jump are the same question
 * asked of a different set, so they are the same function: coming back to the
 * live year lands exactly where a bare `/staff/dev` would, and opening a
 * finished year lands on its LAST event rather than its first, which is what
 * "show me that year" means.
 *
 * Sorts what it is handed instead of trusting the caller's order. The inline
 * version this replaces leant on its caller's `orderBy: { date: 'desc' }` for
 * the past branch, and the year jump it also replaces sorted ascending; a shared
 * helper that only works on pre-sorted input is a trap for its second caller.
 */
export function defaultEvent<T extends DevWorkspaceEvent>(
  events: readonly T[],
): T | null {
  const of = (status: EventLifecycleStatus) =>
    events.filter((e) => e.status === status).sort(byDateAsc);
  const ongoing = of('ongoing')[0];
  const upcoming = of('upcoming')[0];
  const past = of('past').at(-1);
  return ongoing ?? upcoming ?? past ?? null;
}

/**
 * The school years the workspace can switch to, most recent first: those holding
 * at least one event a dev can actually open.
 *
 * Reachability belongs to the list, not to a check after the click. A year whose
 * only event exposes nothing (a bilan with no live form) is not an entry that
 * quietly does nothing when picked, it is not an entry. Ordered on `startYear`
 * rather than on the label text, which is what the label means.
 */
export function navigableSchoolYears(
  events: readonly DevWorkspaceEvent[],
): string[] {
  const byLabel = new Map<string, number>();
  for (const e of events) {
    if (isNavigable(e)) byLabel.set(e.schoolYear.label, e.schoolYear.startYear);
  }
  return [...byLabel].sort((a, b) => b[1] - a[1]).map(([label]) => label);
}

/** The navigable events of one school year, in the order they were given. */
export function eventsOfSchoolYear<T extends DevWorkspaceEvent>(
  events: readonly T[],
  year: string,
): T[] {
  return events.filter((e) => e.schoolYear.label === year && isNavigable(e));
}

/**
 * The event to open when the workspace switches to `year`.
 *
 * Non-null for every year `navigableSchoolYears` lists: same input, same
 * reachability filter. That pairing is the contract, and it is what leaves the
 * caller with a type guard instead of a branch where picking a year does
 * nothing at all.
 */
export function defaultEventOfYear<T extends DevWorkspaceEvent>(
  events: readonly T[],
  year: string,
): T | null {
  return defaultEvent(eventsOfSchoolYear(events, year));
}
