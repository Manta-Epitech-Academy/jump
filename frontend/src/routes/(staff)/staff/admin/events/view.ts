import type { FacetDef } from '$lib/domain/listFacets';
import { defineListChoice, defineListView } from '$lib/domain/listView';
import type { AdminEventVM } from './+page.server';

/**
 * The events cockpit's view, in the address every staff list shares
 * (`$lib/domain/listView`), so a reload or a shared link shows the same list.
 *
 * - **`campus`** filters from the Campus column, several at once.
 * - **`annee`** (a school-year label, `2026-2027`) has no column, so it keeps
 *   its own select on the page, as `ui.md` wants for a facet without a column.
 * - **`periode`** is the KPI tile pressed: the window of the event's life the
 *   list shows. The bare address is `upcoming`, the forward-looking view.
 */

export const EVENTS_FACETS = ['campus'] as const;

export type EventsFacet = (typeof EVENTS_FACETS)[number];

/** Names alphabetically, the readiness most-work-first, the newest dates and
 *  the largest cohorts first. The campus filters instead of sorting: a column
 *  offers one control. */
export const EVENTS_SORT_DEFAULT_DIR = {
  name: 'asc',
  state: 'asc',
  date: 'desc',
  participations: 'desc',
} as const;

export type EventsSortKey = keyof typeof EVENTS_SORT_DEFAULT_DIR;

export const EVENTS_VIEW = defineListView({
  facets: EVENTS_FACETS,
  // The server's own order: the newest events first.
  sort: { firstDir: EVENTS_SORT_DEFAULT_DIR, defaultKey: 'date' },
});

export const EVENTS_FACET_DEFS: Record<EventsFacet, FacetDef<AdminEventVM>> = {
  campus: {
    title: 'Campus',
    valuesOf: (e) => [e.campusId],
    vocabulary: (events) =>
      [...new Map(events.map((e) => [e.campusId, e.campusName]))].sort(
        ([, a], [, b]) => a.localeCompare(b, 'fr'),
      ),
  },
};

/** The windows of an event's life a KPI tile scopes the list to. */
export const EVENT_PERIODS = ['upcoming', 'ongoing', 'prep', 'all'] as const;

export type EventPeriod = (typeof EVENT_PERIODS)[number];

export const EVENT_PERIOD = defineListChoice(
  'periode',
  EVENT_PERIODS,
  'upcoming',
);
