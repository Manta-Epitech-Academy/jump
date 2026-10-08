/**
 * The class B write on events: one configuration change across a filtered set.
 *
 * One write, a patch, like its single-event twin `write_event_config`: the
 * sections, the shown Salesforce statuses and the visibility are fields of one
 * call rather than four tools, so giving a series of events their sections and
 * showing them is one plan and one validation, and lands in one transaction.
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
  setActivationForEvents,
  setModulesForEvents,
  type AdminEventVM,
} from '$lib/server/services/events';
import {
  changeShownStatuses,
  replaceShownStatuses,
  resolveKnownStatuses,
} from '$lib/server/services/devSpaceVisibility';
import { prisma } from '$lib/server/db';
import { isEventModuleKey, EVENT_MODULE_KEYS } from '$lib/domain/eventModules';
import {
  activationBlockers,
  canBeMadeVisible,
} from '$lib/domain/eventReadiness';
import { OperationRefusedError } from '../errors';
import { runTwoStep, type WriteOutcome } from '../plan';
import { resolveScope, type ScopeParams } from '../scope';
import { scopedEvents } from '$lib/server/services/adminStats/cohort';

/** Events one bulk call will touch. Beyond this, narrow the filter. */
export const BULK_EVENTS_LIMIT = 200;

type BulkFilter = ScopeParams & { onlyUpcoming?: boolean };

/**
 * The events a bulk filter selects. Goes through the same scope resolution as
 * every read, so "campus: Lile" is refused here exactly as it is there, before
 * anything is written.
 */
async function targets(filter: BulkFilter): Promise<AdminEventVM[]> {
  const scope = await resolveScope(filter);
  const { events } = await scopedEvents(scope);
  const selected = events
    .filter((e) => !filter.onlyUpcoming || e.status !== 'past')
    .sort((a, b) => a.id.localeCompare(b.id));

  if (selected.length === 0) {
    throw new OperationRefusedError(
      "Aucun événement ne correspond à ce filtre. Vérifiez le périmètre avec config_events avant d'appliquer une modification en masse.",
    );
  }
  if (selected.length > BULK_EVENTS_LIMIT) {
    throw new OperationRefusedError(
      `Ce filtre sélectionne ${selected.length} événements, au-delà de la limite de ${BULK_EVENTS_LIMIT} pour une modification en masse. Restreignez à un campus ou à une année scolaire.`,
    );
  }
  return selected;
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
  visible?: { from: boolean; to: boolean };
};

export type BulkEventConfigParams = BulkFilter & {
  modules?: string[];
  shownStatuses?: string[];
  showStatuses?: string[];
  hideStatuses?: string[];
  visible?: boolean;
  planDigest?: string;
};

/**
 * How the call changes each event's shown statuses: a complete set, or words to
 * add and to remove. Both exist on purpose. A complete set is what copying a
 * preset's statuses means; add/remove is what a word Salesforce renamed for every
 * campus needs, since a complete set would flatten the Coding Clubs that also
 * show CONNECTED into whatever the stages show.
 */
type StatusChange =
  | { kind: 'set'; statuses: string[] }
  | { kind: 'delta'; show: string[]; hide: string[] };

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.join(',') === b.join(',');

async function statusChangeOf(
  params: BulkEventConfigParams,
): Promise<StatusChange | null> {
  const delta =
    params.showStatuses !== undefined || params.hideStatuses !== undefined;
  if (params.shownStatuses !== undefined && delta) {
    throw new OperationRefusedError(
      'Indiquez soit la liste complète des statuts affichés (shownStatuses), soit les statuts à afficher et à masquer (showStatuses, hideStatuses), pas les deux.',
    );
  }
  if (params.shownStatuses !== undefined) {
    return {
      kind: 'set',
      statuses: await resolveKnownStatuses(params.shownStatuses),
    };
  }
  if (!delta) return null;
  const show = await resolveKnownStatuses(params.showStatuses ?? []);
  const hide = await resolveKnownStatuses(params.hideStatuses ?? []);
  const both = show.filter((status) => hide.includes(status));
  if (both.length > 0) {
    throw new OperationRefusedError(
      `Statut${both.length > 1 ? 's' : ''} à la fois à afficher et à masquer : ${both.join(', ')}.`,
    );
  }
  return show.length + hide.length > 0 ? { kind: 'delta', show, hide } : null;
}

function statusesAfter(event: AdminEventVM, change: StatusChange): string[] {
  if (change.kind === 'set') return change.statuses;
  return [...new Set([...event.shownStatuses, ...change.show])]
    .filter((status) => !change.hide.includes(status))
    .sort();
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
  const { visible } = params;
  if (!modules && !statusChange && visible === undefined) {
    throw new OperationRefusedError(
      'Rien à changer : indiquez au moins modules, shownStatuses, showStatuses, hideStatuses ou visible.',
    );
  }

  return runTwoStep({
    requestedDigest: params.planDigest,
    buildPlan: async () => {
      const events = await targets(params);
      const changes: PlanRow[] = [];
      const skipped: (ReturnType<typeof identify> & { reason: string })[] = [];
      for (const event of events) {
        const modulesFrom = [...event.modules].sort();
        const modulesTo = modules ?? modulesFrom;
        const statusesTo = statusChange
          ? statusesAfter(event, statusChange)
          : event.shownStatuses;
        // Judged on the event as this call leaves it, so a section the same
        // call adds counts. An event missing a public name, an end date or a
        // section cannot be shown, and a plan that promised it would be is a
        // plan that lies: it is listed with what it lacks, and the rest of the
        // call still applies to it.
        const leftAs = { ...event, modules: modulesTo };
        let visibleTo = visible ?? event.devActivated;
        if (visibleTo && !event.devActivated && !canBeMadeVisible(leftAs)) {
          visibleTo = false;
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
        if (visibleTo !== event.devActivated) {
          row.visible = { from: event.devActivated, to: visibleTo };
        }
        if (row.modules || row.shownStatuses || row.visible) changes.push(row);
      }
      return { targeted: events.length, changes, skipped };
    },
    apply: async (plan) => {
      const idsWith = (field: 'modules' | 'shownStatuses' | 'visible') =>
        plan.changes.filter((row) => row[field]).map((row) => row.eventId);
      await prisma.$transaction(async (tx) => {
        if (modules) {
          await setModulesForEvents(tx, idsWith('modules'), modules);
        }
        if (statusChange?.kind === 'set') {
          await replaceShownStatuses(
            tx,
            idsWith('shownStatuses'),
            statusChange.statuses,
          );
        } else if (statusChange) {
          await changeShownStatuses(tx, idsWith('shownStatuses'), statusChange);
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
          ...(row.visible ? { visible: row.visible[end] } : {}),
        }));
      return { before: side('from'), after: side('to') };
    },
  });
}
