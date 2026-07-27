/**
 * The class B writes: one configuration change across a filtered set of events.
 *
 * All three follow the same contract, and it is `runTwoStep` that enforces it
 * rather than each tool. Called without `planDigest`, they answer with the exact
 * list of events that would change and how; called with it, they recompute that
 * list, compare, and refuse if the world has moved. So an apply can never ride
 * on a plan somebody imagined, nor on one that was true ten minutes ago.
 *
 * The plan rows are sorted by event id, which is what makes the digest stable:
 * the same filter over the same data has to hash to the same value or every
 * apply would look stale.
 *
 * Repeating an apply is harmless in itself (these set a target state rather than
 * toggling), but the digest check will refuse the second call anyway, because
 * the first one changed the world the plan described.
 */

import { EventService, type AdminEventVM } from '$lib/server/services/events';
import { EventConfigTemplateService } from '$lib/server/services/eventConfigTemplates';
import { isEventModuleKey, EVENT_MODULE_KEYS } from '$lib/domain/eventModules';
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
      "Aucun événement ne correspond à ce filtre. Vérifiez le périmètre avec config_campus_overview ou stats_events_overview avant d'appliquer une modification en masse.",
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

// ── Sections across many events ──────────────────────────────────────────────

export async function bulkEventModules(params: {
  modules: string[];
  planDigest?: string;
  campus?: string;
  schoolYear?: string;
  onlyUpcoming?: boolean;
}): Promise<WriteOutcome> {
  const unknown = params.modules.filter((key) => !isEventModuleKey(key));
  if (unknown.length > 0) {
    throw new OperationRefusedError(
      `Section${unknown.length > 1 ? 's' : ''} inconnue${unknown.length > 1 ? 's' : ''} : ${unknown.join(', ')}. Sections disponibles : ${EVENT_MODULE_KEYS.join(', ')}.`,
    );
  }
  const desired = [...new Set(params.modules)].sort();

  return runTwoStep({
    requestedDigest: params.planDigest,
    buildPlan: async () => {
      const events = await targets(params);
      const changes = events
        .map((event) => {
          const current = [...event.modules].sort();
          return {
            ...identify(event),
            from: current,
            to: desired,
            // Losing a section hides a screen the team may be using today, so
            // the plan names it separately rather than showing a diff to read.
            removed: current.filter((key) => !desired.includes(key)),
          };
        })
        .filter((row) => row.from.join(',') !== row.to.join(','));
      return { targeted: events.length, changes };
    },
    apply: async (plan) => {
      await EventService.bulkSetModules(
        plan.changes.map((c) => c.eventId),
        desired,
      );
      return {
        before: plan.changes.map((c) => ({
          eventId: c.eventId,
          modules: c.from,
        })),
        after: plan.changes.map((c) => ({ eventId: c.eventId, modules: c.to })),
      };
    },
  });
}

// ── Visibility across many events ────────────────────────────────────────────

export async function bulkEventActivation(params: {
  visible: boolean;
  planDigest?: string;
  campus?: string;
  schoolYear?: string;
  onlyUpcoming?: boolean;
}): Promise<WriteOutcome> {
  return runTwoStep({
    requestedDigest: params.planDigest,
    buildPlan: async () => {
      const events = await targets(params);
      const changing = events.filter(
        (event) => (event.configState === 'shown') !== params.visible,
      );
      // Same eligibility rule the service applies, surfaced up front: an event
      // missing a public name, an end date or a section cannot be shown, and a
      // plan that promised it would be is a plan that lies.
      const ineligible = params.visible
        ? changing.filter(
            (e) => !e.publicName || !e.endDate || e.modules.length === 0,
          )
        : [];
      const eligible = changing.filter((e) => !ineligible.includes(e));
      return {
        targeted: events.length,
        changes: eligible.map(identify),
        skipped: ineligible.map((event) => ({
          ...identify(event),
          reason: 'nom public, date de fin ou section manquante',
        })),
      };
    },
    apply: async (plan) => {
      const ids = plan.changes.map((c) => c.eventId);
      const result = await EventService.bulkSetActivation(ids, params.visible);
      return {
        before: { visible: !params.visible, events: ids.length },
        after: { visible: params.visible, ...result },
      };
    },
  });
}

// ── A saved preset across many events ────────────────────────────────────────

export async function bulkApplyEventTemplate(params: {
  templateName: string;
  planDigest?: string;
  campus?: string;
  schoolYear?: string;
  onlyUpcoming?: boolean;
}): Promise<WriteOutcome> {
  const template = (await EventConfigTemplateService.list()).find(
    (t) => t.name === params.templateName,
  );
  if (!template) {
    throw new OperationRefusedError(
      `Modèle « ${params.templateName} » introuvable. L'opération config_event_templates liste les modèles enregistrés.`,
    );
  }
  const desired = [...template.modules].sort();

  return runTwoStep({
    requestedDigest: params.planDigest,
    buildPlan: async () => {
      const events = await targets(params);
      const changes = events
        .map((event) => ({
          ...identify(event),
          from: [...event.modules].sort(),
          to: desired,
        }))
        .filter((row) => row.from.join(',') !== row.to.join(','));
      return {
        template: template.name,
        targeted: events.length,
        changes,
        // Said out loud because the preset carries more than sections, and a
        // bulk apply deliberately does not touch the rest: renaming 40 events
        // in one call is not something a plan should slip in.
        note: "Seules les sections sont appliquées en masse. Le nom public, le nom des participants et l'heure d'arrivée portés par le modèle ne sont pas recopiés ici.",
      };
    },
    apply: async (plan) => {
      await EventService.bulkSetModules(
        plan.changes.map((c) => c.eventId),
        desired,
      );
      return {
        before: plan.changes.map((c) => ({
          eventId: c.eventId,
          modules: c.from,
        })),
        after: plan.changes.map((c) => ({ eventId: c.eventId, modules: c.to })),
      };
    },
  });
}
