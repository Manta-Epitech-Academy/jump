/**
 * "Where do we stand on events?" as finished figures over a périmètre: how many
 * are in each configuration state, and where each section is in use.
 *
 * Two answers are built on them. `config_campus_overview` adds the per-campus
 * breakdown and the team (`configuration.ts`), and the school-year review quotes
 * the totals. This used to be its own operation as well, `stats_events_overview`,
 * which answered the same per-campus question as `config_campus_overview` with a
 * different row: two reads of one subject on one tier, which is one too many for
 * a model choosing between them.
 *
 * Built entirely on `EventService.listAdminEvents`, the same view model the admin
 * events cockpit renders. That is deliberate: readiness ("visible", "prêt à
 * publier", "à configurer") and the participant count are already defined there,
 * with the visible-status cohort rule baked in, so aggregating that list keeps
 * this answer and the screen an admin would open literally unable to disagree.
 *
 * Keys are English (code), definitions are French (read by a human, possibly
 * quoted straight into a chat answer or a digest).
 */

import type { AdminEventVM } from '$lib/server/services/events';
import {
  EVENT_CONFIG_STATE_LABELS,
  EVENT_CONFIG_STATE_HINTS,
  isEventToPrepare,
  type EventConfigState,
} from '$lib/domain/eventReadiness';
import {
  EVENT_MODULE_DEFS,
  type EventModuleKey,
} from '$lib/domain/eventModules';
import { VISIBLE_PARTICIPATION_DEFINITION } from '$lib/domain/sfMemberStatus';
import { metric, share, type Metric } from '$lib/server/adminApi/metrics';
import type { Scope } from '$lib/server/adminApi/scope';
import { scopedEvents } from './cohort';

/** The configuration state of a list of events, counted once for any slice. */
export type EventStateCounts = {
  events: number;
  visible: number;
  /** Share of these events that are live in the dev workspace. */
  visibleShare: number | null;
  /**
   * Configured but hidden. Returned because without it the figures do not add
   * up: `visible` needs both the activation gate and a section, while a section
   * tally counts the section alone, so 25 configured events and 2 activated ones
   * read as a contradiction with nothing naming the 23.
   */
  readyToPublish: number;
  unconfigured: number;
  toPrepare: number;
  participants: number;
};

const countState = (events: AdminEventVM[], state: EventConfigState) =>
  events.filter((e) => e.configState === state).length;

export function eventStateCounts(events: AdminEventVM[]): EventStateCounts {
  const visible = countState(events, 'shown');
  return {
    events: events.length,
    visible,
    visibleShare: share(visible, events.length),
    readyToPublish: countState(events, 'ready'),
    unconfigured: countState(events, 'unconfigured'),
    toPrepare: events.filter(isEventToPrepare).length,
    participants: events.reduce((sum, e) => sum + e.participations, 0),
  };
}

export type ModuleRow = {
  module: EventModuleKey;
  label: string;
  events: number;
};

/** How many events each section is enabled on, most used first. */
export function moduleUsage(events: AdminEventVM[]): ModuleRow[] {
  const counts = new Map<EventModuleKey, number>();
  for (const event of events) {
    for (const key of event.modules) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([module, count]) => ({
      module,
      label: EVENT_MODULE_DEFS[module].label,
      events: count,
    }))
    .sort((a, b) => b.events - a.events);
}

export type EventsSummary = {
  totals: { [K in keyof EventStateCounts]: Metric<EventStateCounts[K]> };
  perModule: Metric<ModuleRow[]>;
};

/** The figures over events already selected, for a caller that has them. */
export function summariseEvents(events: AdminEventVM[]): EventsSummary {
  const counts = eventStateCounts(events);
  return {
    totals: {
      events: metric(
        counts.events,
        'Événements enregistrés dans Jump sur le périmètre demandé (synchronisés depuis Salesforce ou créés à la main).',
      ),
      visible: metric(
        counts.visible,
        `Événements en état « ${EVENT_CONFIG_STATE_LABELS.shown} » : ${EVENT_CONFIG_STATE_HINTS.shown}`,
      ),
      visibleShare: metric(
        counts.visibleShare,
        "Part des événements du périmètre effectivement visibles dans l'espace dev, en pourcentage. Le complément se répartit entre « readyToPublish » et « unconfigured » : les trois états couvrent tous les événements. Vaut null quand le périmètre n'a aucun événement.",
      ),
      readyToPublish: metric(
        counts.readyToPublish,
        `Événements en état « ${EVENT_CONFIG_STATE_LABELS.ready} » : ${EVENT_CONFIG_STATE_HINTS.ready}`,
      ),
      unconfigured: metric(
        counts.unconfigured,
        `Événements en état « ${EVENT_CONFIG_STATE_LABELS.unconfigured} » : ${EVENT_CONFIG_STATE_HINTS.unconfigured}`,
      ),
      toPrepare: metric(
        counts.toPrepare,
        "Événements non passés qui ne sont pas encore visibles dans l'espace dev : ceux qui demandent encore une action. Ce n'est donc pas l'écart entre le total et « visible ».",
      ),
      participants: metric(
        counts.participants,
        `Participations aux événements du périmètre, ${VISIBLE_PARTICIPATION_DEFINITION}. Un talent inscrit à deux événements compte deux fois.`,
      ),
    },
    perModule: metric(
      moduleUsage(events),
      "Nombre d'événements du périmètre où chaque section de l'espace dev est activée, sans tenir compte de l'activation : il inclut les événements configurés mais masqués, c'est pourquoi ce décompte peut largement dépasser « visible ». Un événement pourvu de quatre sections compte une fois dans chacune des quatre lignes.",
    ),
  };
}

export async function getEventsOverview(
  scope: Scope = {},
): Promise<EventsSummary> {
  const { events } = await scopedEvents(scope);
  return summariseEvents(events);
}
