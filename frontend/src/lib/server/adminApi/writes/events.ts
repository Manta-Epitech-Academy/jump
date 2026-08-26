/**
 * The class A writes on one event: its configuration, its visibility, its
 * feedback form, and saving it as a preset.
 *
 * All four go through `EventService`, the same entry point the admin wizard
 * uses, so a change made from a chat and a change made from the screen leave
 * the database in the same state and hit the same validation.
 *
 * The one thing added on top is **patch semantics**. `updateEventConfig` takes a
 * complete configuration and replaces it, which is right for a form (the form
 * holds every field) and wrong for a tool call: a model asked to "set the end
 * date" would have to supply the public name, the cohort noun, the sections and
 * the start time as well, and would cheerfully invent them. So each write reads
 * the current state first, applies only the fields it was actually given, and
 * sends the whole thing back.
 *
 * Every one of them is idempotent: they set values rather than adjusting them,
 * so a retried call after a timeout lands on the same state.
 */

import { EventService, type AdminEventVM } from '$lib/server/services/events';
import { EventConfigTemplateService } from '$lib/server/services/eventConfigTemplates';
import {
  isEventModuleKey,
  parseModuleSettings,
  EVENT_MODULES,
  EVENT_MODULE_KEYS,
} from '$lib/domain/eventModules';
import {
  activationBlockers,
  EVENT_CONFIG_STATE_LABELS,
} from '$lib/domain/eventReadiness';
import { UnknownScopeError } from '../scope';
import { OperationRefusedError } from '../errors';
import { handleProvenanceFr } from '../handles';
import type { WriteOutcome } from '../plan';

/** What every event write reports, before and after, in the same shape. */
type EventState = {
  eventId: string;
  publicName: string;
  cohortNoun: string | null;
  startTime: string;
  endDate: string;
  modules: string[];
  feedbackFormId: string | null;
  diplomaTemplateId: string | null;
  visibleInDevWorkspace: boolean;
  configState: string;
};

const stateOf = (event: AdminEventVM): EventState => ({
  eventId: event.id,
  publicName: event.publicName,
  cohortNoun: event.cohortNoun,
  startTime: event.startTime,
  endDate: event.endDate,
  modules: [...event.modules].sort(),
  feedbackFormId: event.feedbackFormId || null,
  diplomaTemplateId: event.diplomaTemplateId || null,
  visibleInDevWorkspace: event.configState === 'shown',
  configState: EVENT_CONFIG_STATE_LABELS[event.configState],
});

async function loadEvent(eventId: string): Promise<AdminEventVM> {
  const event = (await EventService.listAdminEvents()).find(
    (e) => e.id === eventId,
  );
  if (!event) {
    throw new UnknownScopeError(
      `Événement « ${eventId} » introuvable. ${handleProvenanceFr('eventId')}`,
    );
  }
  return event;
}

/**
 * Send the event back through the wizard's own save, changing only what `patch`
 * names. `moduleSettings` is carried across untouched unless the patch replaces
 * it (only `write_event_inscrits_options` does), and a module added here gets its
 * defaults from `applyModuleDiff`.
 */
async function saveEvent(
  event: AdminEventVM,
  patch: Partial<{
    publicName: string;
    cohortNoun: string;
    startTime: string;
    endDate: string;
    modules: string[];
    devActivated: boolean;
    feedbackFormId: string;
    diplomaTemplateId: string;
    closingTemplateId: string;
    moduleSettings: Record<string, unknown>;
  }>,
): Promise<WriteOutcome> {
  const before = stateOf(event);

  await EventService.updateEventConfig(event.id, {
    publicName: patch.publicName ?? event.publicName,
    cohortNoun: patch.cohortNoun ?? event.cohortNoun ?? '',
    startTime: patch.startTime ?? event.startTime,
    endDate: patch.endDate ?? event.endDate,
    modules: patch.modules ?? event.modules,
    moduleSettings: patch.moduleSettings ?? event.moduleSettings,
    devActivated: patch.devActivated ?? event.devActivated,
    feedbackFormId: patch.feedbackFormId ?? event.feedbackFormId,
    diplomaTemplateId: patch.diplomaTemplateId ?? event.diplomaTemplateId,
    closingTemplateId: patch.closingTemplateId ?? event.closingTemplateId,
  });

  return { applied: true, before, after: stateOf(await loadEvent(event.id)) };
}

export async function writeEventConfig(params: {
  eventId: string;
  publicName?: string;
  cohortNoun?: string;
  startTime?: string;
  endDate?: string;
  modules?: string[];
}): Promise<WriteOutcome> {
  const event = await loadEvent(params.eventId);

  if (params.modules) {
    const unknown = params.modules.filter((key) => !isEventModuleKey(key));
    if (unknown.length > 0) {
      // Refused rather than silently dropped: a misspelled section would
      // otherwise read as "disable it", which is a different instruction.
      throw new OperationRefusedError(
        `Section${unknown.length > 1 ? 's' : ''} inconnue${unknown.length > 1 ? 's' : ''} : ${unknown.join(', ')}. Sections disponibles : ${EVENT_MODULE_KEYS.join(', ')}.`,
      );
    }
  }

  return saveEvent(event, params);
}

export async function writeEventActivation(params: {
  eventId: string;
  visible: boolean;
}): Promise<WriteOutcome> {
  const event = await loadEvent(params.eventId);
  const before = stateOf(event);

  // Checked before the write, and named: activating an event with no section, no
  // end date or no public name would set the flag and change nothing anyone can
  // see. The service refuses it too (`activatableEventWhere`, the SQL twin of
  // this rule), but only as a count, which left the caller to guess which of the
  // three applied.
  const blockers = params.visible ? activationBlockers(event) : [];
  if (blockers.length > 0) {
    throw new OperationRefusedError(
      `Cet événement ne peut pas encore être rendu visible, il lui manque : ${blockers.join(', ')}.`,
    );
  }
  await EventService.bulkSetActivation([event.id], params.visible);

  return { applied: true, before, after: stateOf(await loadEvent(event.id)) };
}

/** The inscrits sub-options, before and after. */
type InscritsOptionsState = {
  eventId: string;
  showStatutColumn: boolean;
};

const inscritsOptionsOf = (event: AdminEventVM): InscritsOptionsState => ({
  eventId: event.id,
  showStatutColumn: parseModuleSettings(
    EVENT_MODULES.INSCRITS,
    event.moduleSettings[EVENT_MODULES.INSCRITS],
  ).showStatutColumn,
});

/**
 * The sub-options of the Inscrits section.
 *
 * This exists because `moduleSettings` was reachable through no write at all:
 * every event write carried the bag across untouched, so a field the config
 * dialog offers had no API equivalent. The catalogue is meant to be the floor
 * under the UI, and `operations.test.ts` now asserts that, so the gap had to
 * close rather than be excepted.
 */
export async function writeEventInscritsOptions(params: {
  eventId: string;
  showStatutColumn?: boolean;
}): Promise<WriteOutcome> {
  const event = await loadEvent(params.eventId);
  if (!event.modules.includes(EVENT_MODULES.INSCRITS)) {
    throw new OperationRefusedError(
      "La section Inscrits n'est pas activée sur cet événement, ses sous-options n'ont donc aucun effet. Activez-la d'abord avec write_event_config.",
    );
  }
  const before = inscritsOptionsOf(event);

  const current = parseModuleSettings(
    EVENT_MODULES.INSCRITS,
    event.moduleSettings[EVENT_MODULES.INSCRITS],
  );
  const outcome = await saveEvent(event, {
    moduleSettings: {
      ...event.moduleSettings,
      [EVENT_MODULES.INSCRITS]: {
        ...current,
        showStatutColumn: params.showStatutColumn ?? current.showStatutColumn,
      },
    },
  });
  if (!outcome.applied) return outcome;

  return {
    applied: true,
    before,
    after: inscritsOptionsOf(await loadEvent(event.id)),
  };
}

export async function writeEventFeedbackForm(params: {
  eventId: string;
  formId?: string;
}): Promise<WriteOutcome> {
  const event = await loadEvent(params.eventId);
  // An empty string is how `updateEventConfig` spells "no form", and it
  // validates a non-empty one against a real row before saving.
  return saveEvent(event, { feedbackFormId: params.formId ?? '' });
}

export async function writeEventTemplate(params: {
  eventId: string;
  name: string;
  description?: string;
}): Promise<WriteOutcome> {
  const event = await loadEvent(params.eventId);
  const before = await EventConfigTemplateService.list().then(
    (templates) => templates.find((t) => t.name === params.name) ?? null,
  );

  const { id, updated } = await EventConfigTemplateService.saveTemplate({
    name: params.name,
    description: params.description ?? '',
    publicName: event.publicName,
    cohortNoun: event.cohortNoun ?? '',
    startTime: event.startTime,
    modules: event.modules,
    moduleSettings: event.moduleSettings,
    feedbackFormId: event.feedbackFormId,
    diplomaTemplateId: event.diplomaTemplateId,
    closingTemplateId: event.closingTemplateId,
    // Nobody's staff profile: the preset was saved by a token, and the audit
    // row already carries which one.
    actorId: null,
  });

  const after = (await EventConfigTemplateService.list()).find(
    (t) => t.id === id,
  );
  return { applied: true, before, after: { ...after, replaced: updated } };
}
