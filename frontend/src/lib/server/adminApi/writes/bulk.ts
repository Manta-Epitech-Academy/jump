/**
 * The class B write on events: one configuration change across a set of events,
 * named or filtered.
 *
 * One write, a patch, like its single-event twin `write_event_config`: the
 * sections, the shown Salesforce statuses, the category and the visibility are
 * fields of one call rather than five tools, so giving a series of events their
 * sections and showing them is one plan and one validation, and lands in one
 * transaction.
 * Visibility is judged on each event as the call leaves it, so the sections the
 * same call adds count.
 *
 * The contract is `runTwoStep`'s. Called without `planDigest`, it answers with
 * the exact list of events that would change and how; called with it, it
 * recomputes that list, compares, and refuses if the world has moved. So an apply
 * can never ride on a plan somebody imagined, nor on one that was true ten
 * minutes ago.
 *
 * The plan rows are sorted by event id, which is what makes the digest stable:
 * the same filter over the same data has to hash to the same value or every
 * apply would look stale.
 *
 * Repeating an apply is harmless in itself (it sets a target state rather than
 * toggling), but the digest check will refuse the second call anyway, because
 * the first one changed the world the plan described.
 */

import {
  EventService,
  setActivationForEvents,
  setCategoryForEvents,
  setModulesForEvents,
  type AdminEventVM,
} from '$lib/server/services/events';
import {
  replaceShownStatuses,
  resolveKnownStatuses,
  type StatusPolicy,
} from '$lib/server/services/devSpaceVisibility';
import { prisma } from '$lib/server/db';
import { isEventModuleKey, EVENT_MODULE_KEYS } from '$lib/domain/eventModules';
import {
  activationBlockers,
  canBeMadeVisible,
  eventConfigState,
} from '$lib/domain/eventReadiness';
import { archivedCategoryRefusal } from '$lib/domain/eventCategory';
import { OperationRefusedError } from '../errors';
import { handleProvenanceFr } from '../handles';
import { runTwoStep, type WriteOutcome } from '../plan';
import { resolveScope, UnknownScopeError, type ScopeParams } from '../scope';
import { scopedEvents } from '$lib/server/services/adminStats/cohort';

/** Events one bulk call will touch. Beyond this, narrow the filter. */
export const BULK_EVENTS_LIMIT = 200;

type BulkFilter = ScopeParams & {
  onlyUpcoming?: boolean;
  eventIds?: string[];
};

/**
 * The events a bulk call selects: the ones it names, or the ones its filter
 * matches. Never both, since a list narrowed again by a filter would change
 * fewer events than were named without saying which. The filter goes through the
 * same scope resolution as every read, so "campus: Lile" is refused here exactly
 * as it is there, before anything is written.
 */
async function targets(filter: BulkFilter): Promise<AdminEventVM[]> {
  const selected = filter.eventIds
    ? await namedEvents(filter)
    : await filteredEvents(filter);

  if (selected.length === 0) {
    throw new OperationRefusedError(
      "Aucun événement ne correspond à ce filtre. Vérifiez le périmètre avec config_events avant d'appliquer une modification en masse.",
    );
  }
  if (selected.length > BULK_EVENTS_LIMIT) {
    throw new OperationRefusedError(
      `Cet appel sélectionne ${selected.length} événements, au-delà de la limite de ${BULK_EVENTS_LIMIT} pour une modification en masse. Restreignez à un campus ou à une année scolaire.`,
    );
  }
  return selected.sort((a, b) => a.id.localeCompare(b.id));
}

async function filteredEvents(filter: BulkFilter): Promise<AdminEventVM[]> {
  const scope = await resolveScope(filter);
  const { events } = await scopedEvents(scope);
  return events.filter((e) => !filter.onlyUpcoming || e.status !== 'past');
}

async function namedEvents({
  eventIds = [],
  ...filter
}: BulkFilter): Promise<AdminEventVM[]> {
  if (
    filter.campus !== undefined ||
    filter.schoolYear !== undefined ||
    filter.onlyUpcoming !== undefined
  ) {
    throw new OperationRefusedError(
      'Indiquez soit les événements (eventIds), soit un filtre (campus, schoolYear, onlyUpcoming), pas les deux.',
    );
  }
  const wanted = new Set(eventIds);
  const events = (await EventService.listAdminEvents()).filter((e) =>
    wanted.has(e.id),
  );
  const unknown = [...wanted].filter((id) => !events.some((e) => e.id === id));
  if (unknown.length > 0) {
    throw new UnknownScopeError(
      `Événement${unknown.length > 1 ? 's' : ''} introuvable${unknown.length > 1 ? 's' : ''} : ${unknown.join(', ')}. ${handleProvenanceFr('eventId')}`,
    );
  }
  return events;
}

/** How every plan row identifies its event, so a human recognises the list. */
const identify = (event: AdminEventVM) => ({
  eventId: event.id,
  event: event.displayName,
  campus: event.campusName,
  dateLabel: event.dateLabel,
});

/** One event the call changes, with only the fields that actually move. */
type PlanRow = ReturnType<typeof identify> & {
  modules?: { from: string[]; to: string[]; removed: string[] };
  shownStatuses?: { from: string[]; to: string[] };
  attendanceStatuses?: { from: string[]; to: string[] };
  category?: { from: string | null; to: string | null };
  visible?: { from: boolean; to: boolean };
};

export type BulkEventConfigParams = BulkFilter & {
  modules?: string[];
  shownStatuses?: string[];
  showStatuses?: string[];
  hideStatuses?: string[];
  attendanceStatuses?: string[];
  attestStatuses?: string[];
  unattestStatuses?: string[];
  categoryKey?: string | null;
  visible?: boolean;
  planDigest?: string;
};

/**
 * How the call changes a list of statuses on each event: a complete set, or
 * words to add and to remove. Both exist on purpose. A complete set is what
 * copying a preset's statuses means; add/remove is what a word Salesforce
 * renamed for every campus needs, since a complete set would flatten the Coding
 * Clubs that also show CONNECTED into whatever the stages show.
 */
type ListChange =
  | { kind: 'set'; statuses: string[] }
  | { kind: 'delta'; add: string[]; remove: string[] };

/** What the call does to the statuses each event shows and counts as a visit. */
type StatusChange = { shown: ListChange | null; attending: ListChange | null };

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.join(',') === b.join(',');

/**
 * One list's change, from its complete-set parameter and its add/remove pair,
 * refusing both at once and a word on both sides. `names` are the parameters as
 * the caller wrote them, for the refusal.
 */
async function listChangeOf(
  set: string[] | undefined,
  add: string[] | undefined,
  remove: string[] | undefined,
  names: { set: string; add: string; remove: string; what: string },
): Promise<ListChange | null> {
  const delta = add !== undefined || remove !== undefined;
  if (set !== undefined && delta) {
    throw new OperationRefusedError(
      `Indiquez soit la liste complète des statuts ${names.what} (${names.set}), soit les statuts à ajouter et à retirer (${names.add}, ${names.remove}), pas les deux.`,
    );
  }
  if (set !== undefined) {
    return { kind: 'set', statuses: await resolveKnownStatuses(set) };
  }
  if (!delta) return null;
  const adding = await resolveKnownStatuses(add ?? []);
  const removing = await resolveKnownStatuses(remove ?? []);
  const both = adding.filter((status) => removing.includes(status));
  if (both.length > 0) {
    throw new OperationRefusedError(
      `Statut${both.length > 1 ? 's' : ''} à la fois à ajouter et à retirer (${names.what}) : ${both.join(', ')}.`,
    );
  }
  return adding.length + removing.length > 0
    ? { kind: 'delta', add: adding, remove: removing }
    : null;
}

async function statusChangeOf(
  params: BulkEventConfigParams,
): Promise<StatusChange | null> {
  const shown = await listChangeOf(
    params.shownStatuses,
    params.showStatuses,
    params.hideStatuses,
    {
      set: 'shownStatuses',
      add: 'showStatuses',
      remove: 'hideStatuses',
      what: 'affichés',
    },
  );
  const attending = await listChangeOf(
    params.attendanceStatuses,
    params.attestStatuses,
    params.unattestStatuses,
    {
      set: 'attendanceStatuses',
      add: 'attestStatuses',
      remove: 'unattestStatuses',
      what: 'comptés comme une venue',
    },
  );
  return shown || attending ? { shown, attending } : null;
}

function listAfter(current: readonly string[], change: ListChange | null) {
  if (!change) return [...current];
  if (change.kind === 'set') return change.statuses;
  return [...new Set([...current, ...change.add])]
    .filter((status) => !change.remove.includes(status))
    .sort();
}

/**
 * What an event shows and counts as a visit once the call is applied. A word it
 * stops showing stops counting, as on one event; a word the call asks to count
 * must be shown once the call is applied, or the event is named in the refusal.
 */
function policyAfter(
  event: AdminEventVM,
  change: StatusChange,
): { shown: string[]; attending: string[]; notShown: string[] } {
  const shown = listAfter(event.shownStatuses, change.shown);
  const asked = listAfter(event.attendanceStatuses, change.attending);
  const requested =
    change.attending?.kind === 'set'
      ? change.attending.statuses
      : (change.attending?.add ?? []);
  return {
    shown,
    attending: asked.filter((status) => shown.includes(status)),
    notShown: requested.filter((status) => !shown.includes(status)),
  };
}

/**
 * The category the call gives, checked before any plan is built. An archived one
 * is refused for the whole call rather than per event: the events that already
 * carry it would not move, and the others may not receive it.
 */
async function refuseUnusableCategory(categoryKey: string) {
  const category = await prisma.eventConfig_Category.findUnique({
    where: { key: categoryKey },
    select: { label: true, archivedAt: true },
  });
  if (!category) {
    throw new OperationRefusedError(
      `Catégorie « ${categoryKey} » introuvable. ${handleProvenanceFr('eventCategoryKey')}`,
    );
  }
  if (category.archivedAt) {
    throw new OperationRefusedError(archivedCategoryRefusal(category.label));
  }
}

export async function bulkEventConfig(
  params: BulkEventConfigParams,
): Promise<WriteOutcome> {
  if (params.modules) {
    const unknown = params.modules.filter((key) => !isEventModuleKey(key));
    if (unknown.length > 0) {
      throw new OperationRefusedError(
        `Section${unknown.length > 1 ? 's' : ''} inconnue${unknown.length > 1 ? 's' : ''} : ${unknown.join(', ')}. Sections disponibles : ${EVENT_MODULE_KEYS.join(', ')}.`,
      );
    }
  }
  const modules = params.modules && [...new Set(params.modules)].sort();
  const statusChange = await statusChangeOf(params);
  const { visible, categoryKey } = params;
  if (categoryKey) await refuseUnusableCategory(categoryKey);
  if (
    !modules &&
    !statusChange &&
    categoryKey === undefined &&
    visible === undefined
  ) {
    throw new OperationRefusedError(
      'Rien à changer : indiquez au moins modules, shownStatuses, showStatuses, hideStatuses, attendanceStatuses, attestStatuses, unattestStatuses, categoryKey ou visible.',
    );
  }

  // Each changed event's policy as the plan leaves it, both lists whole, which
  // the apply needs and the plan rows only show the moving half of. Filled by
  // the plan, which `runTwoStep` always builds before it applies.
  const policyTo = new Map<string, StatusPolicy>();

  return runTwoStep({
    requestedDigest: params.planDigest,
    buildPlan: async () => {
      const events = await targets(params);
      const changes: PlanRow[] = [];
      const skipped: (ReturnType<typeof identify> & { reason: string })[] = [];
      const notShown: string[] = [];
      for (const event of events) {
        const modulesFrom = [...event.modules].sort();
        const modulesTo = modules ?? modulesFrom;
        const after = statusChange && policyAfter(event, statusChange);
        if (after && after.notShown.length > 0)
          notShown.push(`${event.displayName} (${after.notShown.join(', ')})`);
        const statusesTo = after?.shown ?? event.shownStatuses;
        const attendingTo = after?.attending ?? event.attendanceStatuses;
        // Judged on the event as this call leaves it, so a section the same
        // call adds counts. An event missing a public name or a section cannot
        // be activated, so its gate is left off rather than armed for a later
        // section to trip.
        const leftAs = { ...event, modules: modulesTo };
        const visibleTo =
          visible && !event.devActivated && !canBeMadeVisible(leftAs)
            ? false
            : (visible ?? event.devActivated);
        // Asked to be shown and left invisible, whether the rule refused its
        // gate or the gate was already on with no section to show: a plan that
        // read as having shown it would lie, so it is listed with what it
        // lacks, and the rest of the call still applies to it.
        const shownAfter =
          eventConfigState({
            devActivated: visibleTo,
            moduleCount: modulesTo.length,
          }) === 'shown';
        if (visible && !shownAfter) {
          skipped.push({
            ...identify(event),
            reason: `ne peut pas être affiché, il manque : ${activationBlockers(leftAs).join(', ')}`,
          });
        }

        const row: PlanRow = identify(event);
        if (!sameList(modulesFrom, modulesTo)) {
          row.modules = {
            from: modulesFrom,
            to: modulesTo,
            // Losing a section hides a screen the team may be using today, so
            // the plan names it rather than leaving a diff to read.
            removed: modulesFrom.filter((key) => !modulesTo.includes(key)),
          };
        }
        if (!sameList(event.shownStatuses, statusesTo)) {
          row.shownStatuses = { from: event.shownStatuses, to: statusesTo };
        }
        if (!sameList(event.attendanceStatuses, attendingTo)) {
          row.attendanceStatuses = {
            from: event.attendanceStatuses,
            to: attendingTo,
          };
        }
        if (row.shownStatuses || row.attendanceStatuses) {
          policyTo.set(event.id, { shown: statusesTo, attending: attendingTo });
        }
        const categoryFrom = event.category?.key ?? null;
        if (categoryKey !== undefined && categoryKey !== categoryFrom) {
          row.category = { from: categoryFrom, to: categoryKey };
        }
        if (visibleTo !== event.devActivated) {
          row.visible = { from: event.devActivated, to: visibleTo };
        }
        if (
          row.modules ||
          row.shownStatuses ||
          row.attendanceStatuses ||
          row.category ||
          row.visible
        ) {
          changes.push(row);
        }
      }
      if (notShown.length > 0) {
        throw new OperationRefusedError(
          `Un statut ne compte comme une venue que là où il est affiché, ce qui n'est pas le cas sur : ${notShown.join(' ; ')}. ` +
            'Affichez-le aussi (showStatuses ou shownStatuses), ou retirez ces événements de la sélection.',
        );
      }
      return { targeted: events.length, changes, skipped };
    },
    apply: async (plan) => {
      const idsWith = (field: 'modules' | 'category' | 'visible') =>
        plan.changes.filter((row) => row[field]).map((row) => row.eventId);
      // Each event's policy as the plan left it, grouped so that events landing
      // on the same one are written in one set-based statement.
      const byPolicy = new Map<
        string,
        { policy: StatusPolicy; ids: string[] }
      >();
      for (const row of plan.changes) {
        const policy = policyTo.get(row.eventId);
        if (!policy) continue;
        const key = JSON.stringify(policy);
        const group = byPolicy.get(key) ?? { policy, ids: [] };
        group.ids.push(row.eventId);
        byPolicy.set(key, group);
      }
      await prisma.$transaction(async (tx) => {
        if (modules) {
          await setModulesForEvents(tx, idsWith('modules'), modules);
        }
        for (const { policy, ids } of byPolicy.values()) {
          await replaceShownStatuses(tx, ids, policy);
        }
        if (categoryKey !== undefined) {
          await setCategoryForEvents(tx, idsWith('category'), categoryKey);
        }
        if (visible !== undefined) {
          // After the sections, so the activation rule the service re-checks
          // in SQL reads the sections this call has just written.
          await setActivationForEvents(tx, idsWith('visible'), visible);
        }
      });
      const side = (end: 'from' | 'to') =>
        plan.changes.map((row) => ({
          eventId: row.eventId,
          ...(row.modules ? { modules: row.modules[end] } : {}),
          ...(row.shownStatuses
            ? { shownStatuses: row.shownStatuses[end] }
            : {}),
          ...(row.attendanceStatuses
            ? { attendanceStatuses: row.attendanceStatuses[end] }
            : {}),
          ...(row.category ? { categoryKey: row.category[end] } : {}),
          ...(row.visible ? { visible: row.visible[end] } : {}),
        }));
      return { before: side('from'), after: side('to') };
    },
  });
}
