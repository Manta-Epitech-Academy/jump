/**
 * "Where do we stand on events?" as a finished answer.
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

export type CampusRow = {
  campus: string;
  events: number;
  visible: number;
  /** Share of this campus's events that are live in the dev workspace. */
  visibleShare: number | null;
  readyToPublish: number;
  unconfigured: number;
  participants: number;
};

export type ModuleRow = {
  module: EventModuleKey;
  label: string;
  events: number;
};

export type EventsOverview = {
  filters: { schoolYear: string; campus: string };
  totals: {
    events: Metric;
    visible: Metric;
    visibleShare: Metric<number | null>;
    readyToPublish: Metric;
    unconfigured: Metric;
    toPrepare: Metric;
    participants: Metric;
  };
  perCampus: Metric<CampusRow[]>;
  perModule: Metric<ModuleRow[]>;
  availableSchoolYears: Metric<string[]>;
};

const countState = (events: AdminEventVM[], state: EventConfigState) =>
  events.filter((e) => e.configState === state).length;

export async function getEventsOverview(
  scope: Scope = {},
): Promise<EventsOverview> {
  const { events, availableSchoolYears } = await scopedEvents(scope);

  const campuses = new Map<string, AdminEventVM[]>();
  for (const event of events) {
    const bucket = campuses.get(event.campusName);
    if (bucket) bucket.push(event);
    else campuses.set(event.campusName, [event]);
  }

  const moduleCounts = new Map<EventModuleKey, number>();
  for (const event of events) {
    for (const key of event.modules) {
      moduleCounts.set(key, (moduleCounts.get(key) ?? 0) + 1);
    }
  }

  return {
    // The campus is echoed by its resolved name: the scope was checked to exist,
    // so there is no case left where this had to fall back to a raw id.
    filters: {
      schoolYear: scope.schoolYear ?? 'toutes',
      campus: scope.campus?.name ?? 'tous',
    },
    totals: {
      events: metric(
        events.length,
        'Événements enregistrés dans Jump sur le périmètre demandé (synchronisés depuis Salesforce ou créés à la main).',
      ),
      visible: metric(
        countState(events, 'shown'),
        `Événements en état « ${EVENT_CONFIG_STATE_LABELS.shown} » : ${EVENT_CONFIG_STATE_HINTS.shown}`,
      ),
      visibleShare: metric(
        share(countState(events, 'shown'), events.length),
        "Part des événements du périmètre effectivement visibles dans l'espace dev, en pourcentage. Le complément se répartit entre « readyToPublish » et « unconfigured » : les trois états couvrent tous les événements. Vaut null quand le périmètre n'a aucun événement.",
      ),
      readyToPublish: metric(
        countState(events, 'ready'),
        `Événements en état « ${EVENT_CONFIG_STATE_LABELS.ready} » : ${EVENT_CONFIG_STATE_HINTS.ready}`,
      ),
      unconfigured: metric(
        countState(events, 'unconfigured'),
        `Événements en état « ${EVENT_CONFIG_STATE_LABELS.unconfigured} » : ${EVENT_CONFIG_STATE_HINTS.unconfigured}`,
      ),
      toPrepare: metric(
        events.filter(isEventToPrepare).length,
        "Événements non passés qui ne sont pas encore visibles dans l'espace dev : ceux qui demandent encore une action.",
      ),
      participants: metric(
        events.reduce((sum, e) => sum + e.participations, 0),
        `Participations aux événements du périmètre, ${VISIBLE_PARTICIPATION_DEFINITION}. Un talent inscrit à deux événements compte deux fois.`,
      ),
    },
    perCampus: metric(
      [...campuses.entries()]
        .map(([campus, list]) => ({
          campus,
          events: list.length,
          visible: countState(list, 'shown'),
          visibleShare: share(countState(list, 'shown'), list.length),
          readyToPublish: countState(list, 'ready'),
          unconfigured: countState(list, 'unconfigured'),
          participants: list.reduce((sum, e) => sum + e.participations, 0),
        }))
        .sort((a, b) => b.events - a.events),
      `Mêmes compteurs ventilés par campus : events = total, visible / readyToPublish / unconfigured = état de configuration et leur somme fait le total, visibleShare = part des événements du campus visibles dans l'espace dev, participants = participations, ${VISIBLE_PARTICIPATION_DEFINITION}.`,
    ),
    perModule: metric(
      [...moduleCounts.entries()]
        .map(([module, count]) => ({
          module,
          label: EVENT_MODULE_DEFS[module].label,
          events: count,
        }))
        .sort((a, b) => b.events - a.events),
      "Nombre d'événements du périmètre où chaque section de l'espace dev est activée.",
    ),
    availableSchoolYears: metric(
      availableSchoolYears,
      "Années scolaires ayant au moins un événement enregistré, de la plus récente à la plus ancienne, quel que soit le filtre demandé. C'est ce que le filtre « schoolYear » accepte, et toute autre valeur est refusée plutôt que répondue à zéro.",
    ),
  };
}
