/**
 * The events of a périmètre, one row each.
 *
 * The gap this closes is not a missing figure, it is a missing address. Every
 * other answer in this folder counts events; none of them lists them, so the id
 * that twelve operations take as a parameter was obtainable only from
 * `config_unconfigured_events` (which by construction excludes anything already
 * visible), from `stats_attendance_rate` (past events only) and from
 * `ops_emargement_coverage` (only where that section is on). An event that was
 * visible and had not happened yet - the most ordinary state an event can be in -
 * had its id in no read at all, and for a leadership token no non-past event id
 * existed anywhere. Asking "quels événements tourne-t-on en ce moment" is one
 * question, so it is one call.
 *
 * Two projections, one list, because the two tiers are asking different things.
 * The core team asks what still needs doing to an event, so it gets the
 * configuration state and what is missing. National leadership asks what is
 * running and how big it is, and has no business reading a configuration screen:
 * it gets identity, dates and enrolments. Varying the payload by tier inside one
 * operation was the alternative, and it makes an answer depend on who asked,
 * which no other entry in this catalogue does.
 *
 * Built on `scopedEvents`, so no query is added: the view model the admin events
 * cockpit renders already carries every field either projection needs.
 */

import {
  EVENT_CONFIG_STATE_LABELS,
  activationBlockers,
  eventMissingConfig,
  isEventToPrepare,
  type EventConfigState,
} from '$lib/domain/eventReadiness';
import type { EventLifecycleStatus } from '$lib/domain/eventLifecycle';
import type { EventModuleKey } from '$lib/domain/eventModules';
import { VISIBLE_PARTICIPATION_DEFINITION } from '$lib/domain/sfMemberStatus';
import { metric, type Metric } from '$lib/server/adminApi/metrics';
import type { Scope } from '$lib/server/adminApi/scope';
import type { AdminEventVM } from '$lib/server/services/events';
import { scopedEvents } from './cohort';

/** Hard cap on the returned list, whatever the filters. */
export const EVENTS_LIST_LIMIT = 100;

/**
 * Which events the configuration list keeps. The three `EventConfigState` values
 * plus `to_prepare`, the readiness bucket: not past and not yet shown, which is
 * the one question the admin dashboard actually asks and is not a config state.
 */
export const EVENTS_LIST_STATES = [
  'shown',
  'ready',
  'unconfigured',
  'to_prepare',
] as const;
export type EventsListState = (typeof EVENTS_LIST_STATES)[number];

/** What both projections carry: which event this is, when, and how big. */
type EventIdentity = {
  eventId: string;
  /** The name the teams and the talents see: `publicName`, else the SF title. */
  event: string;
  campus: string;
  dateLabel: string;
  schoolYear: string;
  status: EventLifecycleStatus;
  participants: number;
};

/** The leadership row: identity only, no configuration state. */
export type EventDirectoryRow = EventIdentity;

/** The core row: identity plus everything the config wizard owns. */
export type EventConfigRow = EventIdentity & {
  /** Salesforce campaign name, the internal identifier. */
  salesforceName: string;
  configState: EventConfigState;
  configStateLabel: string;
  modules: EventModuleKey[];
  feedbackFormId: string | null;
  /** What is not filled in yet. Descriptive: see `activationBlockers`. */
  missing: string[];
  /** What actually stops it from being made visible. Empty = nothing does. */
  activationBlockers: string[];
};

export type EventsList<Row> = {
  filters: {
    schoolYear: string;
    campus: string;
    status: string;
    state: string;
  };
  events: Metric;
  list: Metric<Row[]>;
  truncated: boolean;
};

export type EventsListParams = {
  status?: EventLifecycleStatus;
  state?: EventsListState;
};

const identityOf = (event: AdminEventVM): EventIdentity => ({
  eventId: event.id,
  event: event.displayName,
  campus: event.campusName,
  dateLabel: event.dateLabel,
  schoolYear: event.schoolYearLabel,
  status: event.status,
  participants: event.participations,
});

const IDENTITY_DEFINITION =
  "Un événement par ligne, du plus récent au plus ancien par date de début. « eventId » est l'identifiant à passer aux opérations qui prennent un événement en filtre. « event » est le nom que voient les équipes et les talents. « status » vaut upcoming (à venir), ongoing (en cours) ou past (terminé), calculé dans le fuseau horaire du campus.";

/** The rows a scope selects, filtered and capped once for both projections. */
async function selectEvents(
  scope: Scope,
  params: EventsListParams,
): Promise<{ matching: AdminEventVM[]; page: AdminEventVM[] }> {
  const { events } = await scopedEvents(scope);

  const matching = events.filter((event) => {
    if (params.status && event.status !== params.status) return false;
    if (!params.state) return true;
    if (params.state === 'to_prepare') return isEventToPrepare(event);
    return event.configState === params.state;
  });

  return { matching, page: matching.slice(0, EVENTS_LIST_LIMIT) };
}

function labels(scope: Scope, params: EventsListParams) {
  return {
    schoolYear: scope.schoolYear ?? 'toutes',
    campus: scope.campus?.name ?? 'tous',
    status: params.status ?? 'tous',
    state: params.state ?? 'tous',
  };
}

const countDefinition =
  "Événements du périmètre, après application des filtres. C'est le total : la liste ci-dessous peut être plus courte, « truncated » dit alors que le plafond a été atteint.";

/**
 * The configuration answer: what each event is, where it stands, and what is
 * still owed on it before its cohort arrives.
 */
export async function getEventsConfigList(
  scope: Scope = {},
  params: EventsListParams = {},
): Promise<EventsList<EventConfigRow>> {
  const { matching, page } = await selectEvents(scope, params);

  return {
    filters: labels(scope, params),
    events: metric(matching.length, countDefinition),
    list: metric(
      page.map((event) => ({
        ...identityOf(event),
        salesforceName: event.titre,
        configState: event.configState,
        configStateLabel: EVENT_CONFIG_STATE_LABELS[event.configState],
        modules: event.modules,
        feedbackFormId: event.feedbackFormId || null,
        missing: eventMissingConfig(event),
        activationBlockers: activationBlockers(event),
      })),
      `${IDENTITY_DEFINITION} « configState » est l'état affiché par la page Événements de l'espace admin : unconfigured (aucune section activée), ready (configuré mais masqué) ou shown (visible dans l'espace dev). « missing » liste ce qui n'est pas renseigné, y compris ce qui n'empêche rien ; « activationBlockers » liste ce qui empêche vraiment de le rendre visible, et une liste vide veut dire qu'un simple basculement suffit. « participants » compte les inscriptions, ${VISIBLE_PARTICIPATION_DEFINITION}. Limité à ${EVENTS_LIST_LIMIT} lignes.`,
    ),
    truncated: matching.length > EVENTS_LIST_LIMIT,
  };
}

/**
 * The steering answer: which events exist on the périmètre, when, and how many
 * people they drew. No configuration state: this tier does not run the wizard.
 */
export async function getEventsDirectory(
  scope: Scope = {},
  params: EventsListParams = {},
): Promise<EventsList<EventDirectoryRow>> {
  const { matching, page } = await selectEvents(scope, params);

  return {
    filters: labels(scope, params),
    events: metric(matching.length, countDefinition),
    list: metric(
      page.map(identityOf),
      `${IDENTITY_DEFINITION} « participants » compte les inscriptions, ${VISIBLE_PARTICIPATION_DEFINITION} : c'est le nombre d'inscrits, pas le nombre de personnes venues, qui se lit avec stats_attendance_rate. Limité à ${EVENTS_LIST_LIMIT} lignes.`,
    ),
    truncated: matching.length > EVENTS_LIST_LIMIT,
  };
}
