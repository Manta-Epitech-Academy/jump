/**
 * Events that still need admin work before their cohort arrives: the answer to
 * the question the PO asks every week.
 *
 * Configuration state, not talent data: an event id, its Salesforce title, its
 * campus and what is missing. Nothing here identifies a person.
 *
 * Same source as the events cockpit (`EventService.listAdminEvents`), so "à
 * configurer" means what the screen means.
 */

import {
  EVENT_CONFIG_STATE_LABELS,
  isEventToPrepare,
  type EventConfigState,
} from '$lib/domain/eventReadiness';
import { metric, type Metric } from '$lib/server/adminApi/metrics';
import type { Scope } from '$lib/server/adminApi/scope';
import { scopedEvents } from './cohort';

/** Hard cap on the returned list, whatever the filters. */
export const UNCONFIGURED_EVENTS_LIMIT = 100;

/** What an event is missing, in staff wording. */
const MISSING_LABELS = {
  publicName: 'nom public',
  cohortNoun: 'nom des participants',
  endDate: 'date de fin',
  modules: 'aucune section activée',
  activation: "pas encore activé pour l'espace dev",
} as const;

export type UnconfiguredEvent = {
  id: string;
  /** Salesforce campaign title: how the event is named upstream. */
  titre: string;
  campus: string;
  dateLabel: string;
  configState: EventConfigState;
  configStateLabel: string;
  /** Human-readable list of what is not set yet. */
  missing: string[];
};

export type UnconfiguredEvents = {
  filters: { schoolYear: string; campus: string };
  toPrepare: Metric;
  events: Metric<UnconfiguredEvent[]>;
  truncated: boolean;
};

export async function getUnconfiguredEvents(
  scope: Scope = {},
): Promise<UnconfiguredEvents> {
  const { events: inScope } = await scopedEvents(scope);

  const candidates = inScope
    // Only what still needs action: a past event needs nothing, and an event
    // already visible is done. Same rule as the cockpit's "À préparer" cue.
    .filter(isEventToPrepare)
    // Soonest first: the urgency of a missing config is how close the cohort is.
    .sort((a, b) => a.dateTs - b.dateTs);

  const events = candidates.slice(0, UNCONFIGURED_EVENTS_LIMIT).map((e) => {
    const missing: string[] = [];
    if (!e.publicName) missing.push(MISSING_LABELS.publicName);
    if (!e.cohortNoun) missing.push(MISSING_LABELS.cohortNoun);
    if (!e.endDate) missing.push(MISSING_LABELS.endDate);
    if (e.modules.length === 0) missing.push(MISSING_LABELS.modules);
    else if (!e.devActivated) missing.push(MISSING_LABELS.activation);

    return {
      id: e.id,
      titre: e.titre,
      campus: e.campusName,
      dateLabel: e.dateLabel,
      configState: e.configState,
      configStateLabel: EVENT_CONFIG_STATE_LABELS[e.configState],
      missing,
    };
  });

  return {
    filters: {
      schoolYear: scope.schoolYear ?? 'toutes',
      campus: scope.campus?.name ?? 'tous',
    },
    toPrepare: metric(
      candidates.length,
      "Événements à venir ou en cours qui ne sont pas encore visibles dans l'espace dev : ceux qui demandent une action avant l'arrivée de leur cohorte.",
    ),
    events: metric(
      events,
      `Détail des événements à préparer, du plus proche au plus lointain, limité à ${UNCONFIGURED_EVENTS_LIMIT} lignes. « titre » est le nom de la campagne Salesforce ; « missing » liste ce qui n'est pas encore renseigné.`,
    ),
    truncated: candidates.length > UNCONFIGURED_EVENTS_LIMIT,
  };
}
