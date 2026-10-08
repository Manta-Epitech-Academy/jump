/**
 * The class A writes on one event: its configuration, and saving it as a preset.
 *
 * One event is one write. Its configuration has many facets (names, dates,
 * sections and their options, shown statuses, the feedback form, certificate and
 * closing grid it points at, the activities it offers, whether the dev workspace
 * shows it), and each used to be its own tool. That split cost a model three or
 * four calls in an order it had to guess to configure and show one event, with
 * nothing atomic about the sequence: a facet is a field, not a tool.
 *
 * It goes through `EventService.updateEventConfig`, the same entry point the
 * admin wizard uses, so a change made from a chat and a change made from the
 * screen leave the database in the same state, hit the same validation, and land
 * in one transaction or not at all.
 *
 * The one thing added on top is **patch semantics**. `updateEventConfig` takes a
 * complete configuration and replaces it, which is right for a form (the form
 * holds every field) and wrong for a tool call: a model asked to "set the end
 * date" would have to supply the public name, the cohort noun, the sections and
 * the start time as well, and would cheerfully invent them. So the write reads
 * the current state first, applies only the fields it was actually given (`null`
 * clears a reference, an omitted field is left alone), and sends the whole thing
 * back. Rules that span facets, the activation rule first, are therefore judged
 * on the configuration being saved, so naming the missing pieces and the
 * activation in one call succeeds.
 *
 * It is idempotent: it sets values rather than adjusting them, so a retried call
 * after a timeout lands on the same state.
 */

import { prisma } from '$lib/server/db';
import {
  EventService,
  type AdminEventVM,
  type EventWorkshopLink,
} from '$lib/server/services/events';
import { EventConfigTemplateService } from '$lib/server/services/eventConfigTemplates';
import {
  isEventModuleKey,
  parseModuleSettings,
  EVENT_MODULE_KEYS,
  type EventModuleSettings,
} from '$lib/domain/eventModules';
import { EVENT_CONFIG_STATE_LABELS } from '$lib/domain/eventReadiness';
import { UnknownScopeError } from '../scope';
import { OperationRefusedError } from '../errors';
import { handleProvenanceFr, type HandleKind } from '../handles';
import type { WriteOutcome } from '../plan';

type WorkshopState = {
  slug: string;
  durationMinutes: number;
  labelOverride: string | null;
};

/** What the event write reports, before and after: every field it can change. */
type EventState = {
  eventId: string;
  publicName: string;
  cohortNoun: string | null;
  startTime: string;
  endDate: string;
  modules: string[];
  moduleSettings: Record<string, unknown>;
  shownStatuses: string[];
  feedbackFormId: string | null;
  diplomaTemplateId: string | null;
  closingTemplateId: string | null;
  workshops: WorkshopState[];
  visibleInDevWorkspace: boolean;
  configState: string;
};

async function stateOf(event: AdminEventVM): Promise<EventState> {
  // Not on `AdminEventVM`: the list it builds serves every event of the
  // cockpit, and only this write ever needs an event's activities.
  const workshops = await prisma.eventConfig_Workshop.findMany({
    where: { eventId: event.id },
    orderBy: { position: 'asc' },
    select: {
      durationMinutes: true,
      labelOverride: true,
      activity: { select: { slug: true } },
    },
  });
  return {
    eventId: event.id,
    publicName: event.publicName,
    cohortNoun: event.cohortNoun,
    startTime: event.startTime,
    endDate: event.endDate,
    modules: [...event.modules].sort(),
    moduleSettings: event.moduleSettings,
    shownStatuses: event.shownStatuses,
    feedbackFormId: event.feedbackFormId || null,
    diplomaTemplateId: event.diplomaTemplateId || null,
    closingTemplateId: event.closingTemplateId || null,
    workshops: workshops.map((link) => ({
      slug: link.activity.slug,
      durationMinutes: link.durationMinutes,
      labelOverride: link.labelOverride,
    })),
    visibleInDevWorkspace: event.configState === 'shown',
    configState: EVENT_CONFIG_STATE_LABELS[event.configState],
  };
}

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

/** The sub-options a call may set, per section. Only Inscrits has any today. */
type ModuleSettingsPatch = {
  [K in keyof EventModuleSettings]?: Partial<EventModuleSettings[K]>;
};

export type EventConfigPatch = {
  eventId: string;
  publicName?: string;
  cohortNoun?: string;
  startTime?: string;
  endDate?: string;
  modules?: string[];
  moduleSettings?: ModuleSettingsPatch;
  shownStatuses?: string[];
  visible?: boolean;
  feedbackFormId?: string | null;
  diplomaTemplateId?: string | null;
  closingTemplateId?: string | null;
  workshops?: {
    slug: string;
    durationMinutes: number;
    labelOverride?: string;
  }[];
};

function refuseUnknownModules(modules: string[]) {
  const unknown = modules.filter((key) => !isEventModuleKey(key));
  if (unknown.length === 0) return;
  // Refused rather than silently dropped: a misspelled section would otherwise
  // read as "disable it", which is a different instruction.
  throw new OperationRefusedError(
    `Section${unknown.length > 1 ? 's' : ''} inconnue${unknown.length > 1 ? 's' : ''} : ${unknown.join(', ')}. Sections disponibles : ${EVENT_MODULE_KEYS.join(', ')}.`,
  );
}

/**
 * The sub-options to save: the stored ones, with the patch laid over the
 * sections it names. A section's options only exist while the section does, so
 * naming one the saved configuration leaves off is refused rather than stored
 * to no effect; enabling it in the same call is what makes it count.
 */
function mergedModuleSettings(
  event: AdminEventVM,
  modules: readonly string[],
  patch: ModuleSettingsPatch | undefined,
): Record<string, unknown> {
  if (!patch) return event.moduleSettings;
  const merged = { ...event.moduleSettings };
  for (const [key, values] of Object.entries(patch)) {
    if (!values || !isEventModuleKey(key)) continue;
    if (!modules.includes(key)) {
      throw new OperationRefusedError(
        `La section ${key} n'est pas activée sur cet événement, ses sous-options n'auraient donc aucun effet. Ajoutez-la à modules dans le même appel.`,
      );
    }
    const given = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== undefined),
    );
    merged[key] = {
      ...parseModuleSettings(key, event.moduleSettings[key]),
      ...given,
    };
  }
  return merged;
}

const REFERENCES = {
  feedbackFormId: {
    handle: 'formId',
    label: 'Formulaire de feedback',
    exists: (id: string) =>
      prisma.feedback_Form.findUnique({ where: { id }, select: { id: true } }),
  },
  diplomaTemplateId: {
    handle: 'diplomaTemplateId',
    label: 'Certificat',
    exists: (id: string) =>
      prisma.diploma_Template.findUnique({
        where: { id },
        select: { id: true },
      }),
  },
  closingTemplateId: {
    handle: 'closingTemplateId',
    label: 'Grille de closing',
    exists: (id: string) =>
      prisma.closing_Template.findUnique({
        where: { id },
        select: { id: true },
      }),
  },
} satisfies Record<
  string,
  {
    handle: HandleKind;
    label: string;
    exists: (id: string) => Promise<unknown>;
  }
>;

/**
 * The id to save for one reference: the stored one when the call omits it, none
 * when it sends `null`, and otherwise the id given, refused with where a valid
 * one comes from when nothing has it. The service checks existence too; this is
 * the check that can name the read a model should have called.
 */
async function resolvedReference(
  field: keyof typeof REFERENCES,
  given: string | null | undefined,
  stored: string,
): Promise<string> {
  if (given === undefined) return stored;
  const id = given?.trim() ?? '';
  if (id === '') return '';
  const reference = REFERENCES[field];
  if (!(await reference.exists(id))) {
    throw new OperationRefusedError(
      `${reference.label} « ${id} » introuvable. ${handleProvenanceFr(reference.handle)}`,
    );
  }
  return id;
}

/** The activities as the service stores them, slugs resolved to their rows. */
async function resolvedWorkshops(
  workshops: NonNullable<EventConfigPatch['workshops']>,
): Promise<EventWorkshopLink[]> {
  const slugs = workshops.map((w) => w.slug.trim());
  const duplicates = slugs.filter(
    (slug, index) => slugs.indexOf(slug) !== index,
  );
  if (duplicates.length > 0) {
    throw new OperationRefusedError(
      `Une activité ne peut être proposée qu'une fois par événement. En double : ${[...new Set(duplicates)].join(', ')}.`,
    );
  }
  const known = await prisma.workshop_Activity.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true },
  });
  const idBySlug = new Map(known.map((a) => [a.slug, a.id]));
  const unknown = slugs.filter((slug) => !idBySlug.has(slug));
  if (unknown.length > 0) {
    throw new OperationRefusedError(
      `Activités introuvables : ${unknown.join(', ')}. ${handleProvenanceFr('workshopSlug')}`,
    );
  }
  return workshops.map((workshop, index) => ({
    activityId: idBySlug.get(slugs[index])!,
    durationMinutes: workshop.durationMinutes,
    labelOverride: workshop.labelOverride?.trim() || null,
  }));
}

export async function writeEventConfig(
  params: EventConfigPatch,
): Promise<WriteOutcome> {
  const event = await loadEvent(params.eventId);
  const before = await stateOf(event);

  if (params.modules) refuseUnknownModules(params.modules);
  const modules = params.modules ?? event.modules;

  await EventService.updateEventConfig(event.id, {
    publicName: params.publicName ?? event.publicName,
    cohortNoun: params.cohortNoun ?? event.cohortNoun ?? '',
    startTime: params.startTime ?? event.startTime,
    endDate: params.endDate ?? event.endDate,
    modules,
    moduleSettings: mergedModuleSettings(event, modules, params.moduleSettings),
    devActivated: params.visible ?? event.devActivated,
    feedbackFormId: await resolvedReference(
      'feedbackFormId',
      params.feedbackFormId,
      event.feedbackFormId,
    ),
    diplomaTemplateId: await resolvedReference(
      'diplomaTemplateId',
      params.diplomaTemplateId,
      event.diplomaTemplateId,
    ),
    closingTemplateId: await resolvedReference(
      'closingTemplateId',
      params.closingTemplateId,
      event.closingTemplateId,
    ),
    shownStatuses: params.shownStatuses ?? event.shownStatuses,
    workshops: params.workshops && (await resolvedWorkshops(params.workshops)),
  });

  return {
    applied: true,
    before,
    after: await stateOf(await loadEvent(event.id)),
  };
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
    shownStatuses: event.shownStatuses,
    // Nobody's staff profile: the preset was saved by a token, and the audit
    // row already carries which one.
    actorId: null,
  });

  const after = (await EventConfigTemplateService.list()).find(
    (t) => t.id === id,
  );
  return { applied: true, before, after: { ...after, replaced: updated } };
}
