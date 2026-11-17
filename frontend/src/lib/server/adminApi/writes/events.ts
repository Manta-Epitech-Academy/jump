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
 * It goes through `EventService.updateEventConfig`, which holds the rules of an
 * event's configuration (an archived category, the activation rule), and lands in
 * one transaction or not at all.
 *
 * The one thing added on top is **patch semantics**. `updateEventConfig` takes a
 * complete configuration and replaces it, which is wrong for a tool call: a
 * model asked to "set the arrival time" would have to supply the public name,
 * the cohort noun, the sections and the start time as well, and would
 * cheerfully invent them. So the write reads
 * the current state first, applies only the fields it was actually given (`null`
 * clears a field, an omitted field is left alone), and sends the whole thing
 * back. Rules that span facets, the activation rule first, are therefore judged
 * on the configuration being saved, so naming the missing pieces and the
 * activation in one call succeeds.
 *
 * It is idempotent: it sets values rather than adjusting them, so a retried call
 * after a timeout lands on the same state.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import {
  EventService,
  eventHeroOf,
  eventWorkshopsOf,
  jumpOwnedFields,
  lockEvent,
  replaceEventHero,
  storedEventHeroPictures,
  type AdminEventVM,
  type EventHeroStageWrite,
  type EventHeroState,
  type EventWorkshopLink,
  type EventWorkshopState,
} from '$lib/server/services/events';
import { replacePictures } from '$lib/server/images/remote';
import {
  EVENT_HERO_STAGES,
  HERO_BUTTON_MAX,
  HERO_TEXT_MAX,
  HERO_TITLE_MAX,
  eventHeroImageKey,
  heroStageHasPicture,
  type EventHeroStage,
} from '$lib/domain/eventHero';
import { checkSignupUrl } from './talentHome';
import { EventConfigTemplateService } from '$lib/server/services/eventConfigTemplates';
import {
  isEventModuleKey,
  parseModuleSettings,
  EVENT_MODULE_KEYS,
  type EventModuleSettings,
} from '$lib/domain/eventModules';
import { EVENT_CONFIG_STATE_LABELS } from '$lib/domain/eventReadiness';
import { normalizeSfStatus } from '$lib/domain/sfMemberStatus';
import { slotLabelFr, type PresenceSlot } from '$lib/domain/eventPresence';
import { hhmmToMinutes } from '$lib/domain/event';
import {
  eventMoments,
  momentOutsideEvent,
  type EventWorkshopMoment,
} from '$lib/domain/workshops';
import { UnknownScopeError } from '../scope';
import { archivedAtFor } from './catalogue';
import { OperationRefusedError } from '../errors';
import { handleProvenanceFr, type HandleKind } from '../handles';
import type { WriteOutcome } from '../plan';

/** What the event write reports, before and after: every field it can change. */
type EventState = {
  eventId: string;
  publicName: string | null;
  cohortNoun: string | null;
  startTime: string | null;
  categoryKey: string | null;
  modules: string[];
  moduleSettings: Record<string, unknown>;
  shownStatuses: string[];
  attendanceStatuses: string[];
  feedbackFormId: string | null;
  diplomaTemplateId: string | null;
  closingTemplateId: string | null;
  workshops: EventWorkshopState[];
  signupUrl: string | null;
  hero: EventHeroState;
  visibleInDevWorkspace: boolean;
  configState: string;
};

async function stateOf(event: AdminEventVM): Promise<EventState> {
  // Not on `AdminEventVM`: the list it builds serves every event of the
  // cockpit, and only one event's configuration ever needs its activities.
  return {
    eventId: event.id,
    ...jumpOwnedFields(event),
    categoryKey: event.category?.key ?? null,
    modules: [...event.modules].sort(),
    moduleSettings: event.moduleSettings,
    shownStatuses: event.shownStatuses,
    attendanceStatuses: event.attendanceStatuses,
    feedbackFormId: event.feedbackFormId || null,
    diplomaTemplateId: event.diplomaTemplateId || null,
    closingTemplateId: event.closingTemplateId || null,
    workshops: await eventWorkshopsOf(event.id),
    // Not on `AdminEventVM` either, for the same reason: only the event's own
    // configuration reads what it says on the talent home.
    signupUrl: await eventSignupUrlOf(event.id),
    hero: await eventHeroOf(event.id),
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
  publicName?: string | null;
  cohortNoun?: string | null;
  startTime?: string | null;
  categoryKey?: string | null;
  modules?: string[];
  moduleSettings?: ModuleSettingsPatch;
  shownStatuses?: string[];
  attendanceStatuses?: string[];
  visible?: boolean;
  feedbackFormId?: string | null;
  diplomaTemplateId?: string | null;
  closingTemplateId?: string | null;
  workshops?: {
    slug: string;
    labelOverride?: string | null;
    day?: string | null;
    slot?: PresenceSlot | null;
  }[];
  signupUrl?: string | null;
  hero?: Partial<Record<EventHeroStage, HeroStagePatch | null>>;
};

/** One stage of the hero as a call gives it: `imageUrl` omitted is none. */
type HeroStagePatch = {
  title: string | null;
  text: string | null;
  buttonLabel: string | null;
  imageUrl?: string | null;
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
  stored: Record<string, unknown>,
  modules: readonly string[],
  patch: ModuleSettingsPatch | undefined,
  subject: 'cet événement' | 'ce modèle',
): Record<string, unknown> {
  if (!patch) return stored;
  const merged = { ...stored };
  for (const [key, values] of Object.entries(patch)) {
    if (!values || !isEventModuleKey(key)) continue;
    if (!modules.includes(key)) {
      throw new OperationRefusedError(
        `La section ${key} n'est pas activée sur ${subject}, ses sous-options n'auraient donc aucun effet. Ajoutez-la à modules dans le même appel.`,
      );
    }
    const given = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== undefined),
    );
    merged[key] = {
      ...parseModuleSettings(key, stored[key]),
      ...given,
    };
  }
  return merged;
}

const REFERENCES = {
  categoryKey: {
    handle: 'eventCategoryKey',
    label: 'Catégorie',
    exists: (key: string) =>
      prisma.eventConfig_Category.findUnique({
        where: { key },
        select: { key: true },
      }),
  },
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
 * The id (or, for a category, the key) to save for one reference: the stored one
 * when the call omits it, none when it sends `null`, and otherwise the value
 * given, refused with where a valid one comes from when nothing has it. The service checks existence too; this is
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

/**
 * The value to save for one of the fields Jump owns: the stored one when the
 * call omits it, none when it sends `null`, and otherwise the value given. The
 * service takes a complete configuration and reads `''` as "none", so that is
 * what `null` becomes here; `??` alone would read `null` as "omitted" and keep
 * the value the call asked to remove.
 */
function patched(
  given: string | null | undefined,
  stored: string | null,
): string {
  if (given === undefined) return stored ?? '';
  return given ?? '';
}

/** The activities as the service stores them, slugs resolved to their rows. */
async function resolvedWorkshops(
  eventId: string,
  workshops: NonNullable<EventConfigPatch['workshops']>,
  startMinutes: number | null,
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
  const moments = await checkedMoments(eventId, workshops, slugs, startMinutes);
  return workshops.map((workshop, index) => ({
    activityId: idBySlug.get(slugs[index])!,
    labelOverride: workshop.labelOverride?.trim() || null,
    ...moments[index],
  }));
}

/**
 * The moment each activity is offered at, refused when the call gives one that
 * names no moment of the event (`momentOutsideEvent`), judged on the arrival
 * time this same call saves. Only a moment the call changes is judged: one sent
 * back exactly as stored is accepted even if it no longer falls on the event
 * (Salesforce moved its days), so the read sent back is never refused for
 * something the call did not touch; `config_event_detail` lists it
 * (`workshopsOutsideEvent`).
 */
async function checkedMoments(
  eventId: string,
  workshops: NonNullable<EventConfigPatch['workshops']>,
  slugs: readonly string[],
  startMinutes: number | null,
): Promise<EventWorkshopMoment[]> {
  const moments = workshops.map((w) => ({
    day: w.day ?? null,
    slot: w.slot ?? null,
  }));
  if (moments.every((m) => m.day === null && m.slot === null)) return moments;

  const [event, stored] = await Promise.all([
    prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: {
        date: true,
        endDate: true,
        campus: { select: { timezone: true } },
      },
    }),
    eventWorkshopsOf(eventId),
  ]);
  const frame = eventMoments({ ...event, startMinutes }, event.campus.timezone);
  const storedBySlug = new Map(stored.map((link) => [link.slug, link]));

  moments.forEach(({ day, slot }, index) => {
    const slug = slugs[index];
    if (slot !== null && day === null) {
      throw new OperationRefusedError(
        `Activité ${slug} : une demi-journée se donne avec son jour (day). Envoyez day, ou slot à null pour la proposer sur tout l'événement.`,
      );
    }
    const before = storedBySlug.get(slug);
    if (before && before.day === day && before.slot === slot) return;
    switch (momentOutsideEvent({ day, slot }, frame)) {
      case 'day':
        throw new OperationRefusedError(
          `Activité ${slug} : le ${day} n'est pas un jour de cet événement. Jours possibles : ${frame.days.join(', ')}.`,
        );
      case 'morning':
        throw new OperationRefusedError(
          `Activité ${slug} : l'événement ne commence que l'après-midi du ${day}, il n'y a pas de ${slotLabelFr('morning').toLowerCase()} ce jour-là.`,
        );
    }
  });
  return moments;
}

/**
 * The statuses an event or a preset shows and counts as a visit once the patch
 * is laid over it. A list the call sends is taken whole (and refused by the
 * service if it counts a word it does not show); a list it leaves out is kept,
 * except that a word it stops showing also stops counting, as hiding a word
 * does everywhere.
 */
function statusPolicyFor(
  params: { shownStatuses?: string[]; attendanceStatuses?: string[] },
  base: { shownStatuses: string[]; attendanceStatuses: string[] },
): { shownStatuses: string[]; attendanceStatuses: string[] } {
  const shownStatuses = params.shownStatuses ?? base.shownStatuses;
  if (params.attendanceStatuses) {
    return { shownStatuses, attendanceStatuses: params.attendanceStatuses };
  }
  const shown = new Set(shownStatuses.map((raw) => normalizeSfStatus(raw)));
  return {
    shownStatuses,
    attendanceStatuses: base.attendanceStatuses.filter((status) =>
      shown.has(status),
    ),
  };
}

async function eventSignupUrlOf(eventId: string): Promise<string | null> {
  const { signupUrl } = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { signupUrl: true },
  });
  return signupUrl;
}

/** Longest stored edge of a hero picture: the hero's picture slot. */
const HERO_IMAGE_MAX_EDGE = 1280;

const HERO_STAGE_LABELS: Record<EventHeroStage, string> = {
  invitation: 'invitation',
  enrolled: 'inscrit',
  live: 'pendant',
};

/** One written field of a stage: absent or within its limit, never blank. */
function checkedHeroField(
  stage: EventHeroStage,
  label: string,
  value: string | null,
  max: number,
): string | null {
  if (value === null) return null;
  if (value.trim() === '' || value.length > max) {
    throw new OperationRefusedError(
      `Bandeau « ${HERO_STAGE_LABELS[stage]} » : ${label} doit faire entre 1 et ${max} caractères (reçu : ${value.length}). Pour garder les mots de la maquette, passez-le à null.`,
    );
  }
  return value;
}

/**
 * One stage as the call writes it, refused when it holds nothing: a stage left
 * to the mockup's words is cleared with `null`, not written empty, so there is
 * one way to say it.
 */
function checkedHeroStage(
  stage: EventHeroStage,
  given: HeroStagePatch,
): EventHeroStageWrite {
  const imageUrl = given.imageUrl ?? null;
  if (imageUrl !== null && !heroStageHasPicture(stage)) {
    throw new OperationRefusedError(
      `Le bandeau « ${HERO_STAGE_LABELS[stage]} » n'a pas d'image : pendant l'événement, il présente les sujets.`,
    );
  }
  const written = {
    title: checkedHeroField(stage, 'le titre', given.title, HERO_TITLE_MAX),
    text: checkedHeroField(stage, 'le texte', given.text, HERO_TEXT_MAX),
    buttonLabel: checkedHeroField(
      stage,
      'le bouton',
      given.buttonLabel,
      HERO_BUTTON_MAX,
    ),
    imageUrl,
  };
  if (Object.values(written).every((value) => value === null)) {
    throw new OperationRefusedError(
      `Le bandeau « ${HERO_STAGE_LABELS[stage]} » ne dit rien. Pour lui rendre les mots de la maquette, passez-le à null.`,
    );
  }
  return written;
}

/**
 * Every stage of the hero once the patch is laid over what is stored: a stage
 * the call names is taken as given (a stage is sent whole), one it leaves out
 * keeps its words and its picture.
 */
function mergedHero(
  stored: EventHeroState,
  patch: NonNullable<EventConfigPatch['hero']>,
): Record<EventHeroStage, EventHeroStageWrite | null> {
  const merged = {} as Record<EventHeroStage, EventHeroStageWrite | null>;
  for (const stage of EVENT_HERO_STAGES) {
    const given = patch[stage];
    if (given === undefined) {
      const kept = stored[stage];
      merged[stage] = kept && {
        imageUrl: null,
        ...kept,
      };
    } else {
      merged[stage] = given && checkedHeroStage(stage, given);
    }
  }
  return merged;
}

/**
 * The sign-up form to save: `''` for none, the service's spelling. Whether a
 * campus pointing at the event lets it go is the save's own check
 * (`EventService.updateEventConfig`), made under the event's lock.
 */
function checkedSignupUrl(
  given: string | null | undefined,
  stored: string | null,
): string {
  if (given === undefined) return stored ?? '';
  if (given === null) return '';
  checkSignupUrl(given);
  return given;
}

export async function writeEventConfig(
  params: EventConfigPatch,
): Promise<WriteOutcome> {
  const event = await loadEvent(params.eventId);
  const before = await stateOf(event);

  if (params.modules) refuseUnknownModules(params.modules);
  const modules = params.modules ?? event.modules;

  const startTime = patched(params.startTime, event.startTime);
  const config = {
    publicName: patched(params.publicName, event.publicName),
    cohortNoun: patched(params.cohortNoun, event.cohortNoun),
    startTime,
    // Whether an archived one may be given is the service's rule, the wizard's
    // too: refused as a new choice, kept on an event that already carries it.
    categoryKey: await resolvedReference(
      'categoryKey',
      params.categoryKey,
      event.category?.key ?? '',
    ),
    modules,
    moduleSettings: mergedModuleSettings(
      event.moduleSettings,
      modules,
      params.moduleSettings,
      'cet événement',
    ),
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
    ...statusPolicyFor(params, event),
    signupUrl: checkedSignupUrl(params.signupUrl, before.signupUrl),
    workshops:
      params.workshops &&
      (await resolvedWorkshops(
        event.id,
        params.workshops,
        hhmmToMinutes(startTime),
      )),
  };

  if (!params.hero) {
    await EventService.updateEventConfig(event.id, config);
  } else {
    // The hero's pictures are copied before anything is saved, and the
    // configuration lands in the transaction that points at them: a picture
    // that cannot be copied refuses the whole call, and a refused
    // configuration leaves no picture behind.
    const stages = mergedHero(before.hero, params.hero);
    await replacePictures({
      requests: EVENT_HERO_STAGES.flatMap((stage) => {
        const sourceUrl = stages[stage]?.imageUrl;
        return sourceUrl
          ? [{ slot: stage, sourceUrl, maxEdge: HERO_IMAGE_MAX_EDGE }]
          : [];
      }),
      keyFor: (request, writeId, extension) =>
        eventHeroImageKey(
          event.id,
          request.slot as EventHeroStage,
          writeId,
          extension,
        ),
      refusal: (request, why) =>
        new OperationRefusedError(
          `L'image du bandeau « ${HERO_STAGE_LABELS[request.slot as EventHeroStage]} » (${request.sourceUrl}) ${why}. L'événement n'a pas changé.`,
        ),
      readStored: (db) => storedEventHeroPictures(db, event.id),
      lock: (tx) => lockEvent(tx, event.id),
      commit: async (tx, pictures) => {
        await EventService.updateEventConfig(event.id, config, tx);
        await replaceEventHero(tx, event.id, stages, pictures);
      },
    });
  }

  return {
    applied: true,
    before,
    after: await stateOf(await loadEvent(event.id)),
  };
}

/**
 * What a preset holds, as the write takes it: every field patchable, `null`
 * clearing it. The same shape as an event's configuration minus what only an
 * event has (its activities, its visibility), because applying a preset is
 * copying these values into `write_event_config`.
 */
export type EventTemplatePatch = {
  name: string;
  description?: string | null;
  eventId?: string;
  publicName?: string | null;
  cohortNoun?: string | null;
  startTime?: string | null;
  categoryKey?: string | null;
  modules?: string[];
  moduleSettings?: ModuleSettingsPatch;
  shownStatuses?: string[];
  attendanceStatuses?: string[];
  feedbackFormId?: string | null;
  diplomaTemplateId?: string | null;
  closingTemplateId?: string | null;
  archived?: boolean;
};

type PresetConfig = {
  publicName: string | null;
  cohortNoun: string | null;
  startTime: string | null;
  categoryKey: string | null;
  modules: string[];
  moduleSettings: Record<string, unknown>;
  shownStatuses: string[];
  attendanceStatuses: string[];
  feedbackFormId: string | null;
  diplomaTemplateId: string | null;
  closingTemplateId: string | null;
};

/** An event's configuration, as a preset captures it. */
function presetConfigOf(event: AdminEventVM): PresetConfig {
  return {
    publicName: event.publicName,
    cohortNoun: event.cohortNoun,
    startTime: event.startTime || null,
    categoryKey: event.category?.key ?? null,
    modules: event.modules,
    moduleSettings: event.moduleSettings,
    shownStatuses: event.shownStatuses,
    attendanceStatuses: event.attendanceStatuses,
    feedbackFormId: event.feedbackFormId || null,
    diplomaTemplateId: event.diplomaTemplateId || null,
    closingTemplateId: event.closingTemplateId || null,
  };
}

const BLANK_PRESET: PresetConfig = {
  publicName: null,
  cohortNoun: null,
  startTime: null,
  categoryKey: null,
  modules: [],
  moduleSettings: {},
  shownStatuses: [],
  attendanceStatuses: [],
  feedbackFormId: null,
  diplomaTemplateId: null,
  closingTemplateId: null,
};

/**
 * Create, edit or archive one preset, by its name.
 *
 * What it starts from, in order: the event named by `eventId` (capturing an
 * event as it stands, which is how most presets are born), else the preset as
 * stored, else nothing. The fields the call gives are then laid over it with the
 * same patch semantics as `write_event_config`, so a preset can be written from
 * values alone, or captured from an event and adjusted in the same call.
 *
 * Archived, never deleted: every preset name is readable, so a delete would be
 * one a model could aim on its own (class C).
 */
export async function writeEventTemplate(
  params: EventTemplatePatch,
): Promise<WriteOutcome> {
  const name = params.name.trim();
  const before =
    (await EventConfigTemplateService.list()).find((t) => t.name === name) ??
    null;
  if (!before && !params.eventId && !params.modules) {
    throw new OperationRefusedError(
      `Aucun modèle ne s'appelle « ${name} ». Pour en créer un, partez d'un événement (eventId) ou donnez au moins ses sections (modules). ${handleProvenanceFr('templateName')}`,
    );
  }

  const base = params.eventId
    ? presetConfigOf(await loadEvent(params.eventId))
    : (before ?? BLANK_PRESET);
  if (params.modules) refuseUnknownModules(params.modules);
  const modules = params.modules ?? base.modules;

  const { template, updated } = await EventConfigTemplateService.saveTemplate({
    name,
    description: patched(params.description, before?.description ?? null),
    publicName: patched(params.publicName, base.publicName),
    cohortNoun: patched(params.cohortNoun, base.cohortNoun),
    startTime: patched(params.startTime, base.startTime),
    categoryKey: await resolvedReference(
      'categoryKey',
      params.categoryKey,
      base.categoryKey ?? '',
    ),
    modules,
    moduleSettings: mergedModuleSettings(
      base.moduleSettings,
      modules,
      params.moduleSettings,
      'ce modèle',
    ),
    feedbackFormId: await resolvedReference(
      'feedbackFormId',
      params.feedbackFormId,
      base.feedbackFormId ?? '',
    ),
    diplomaTemplateId: await resolvedReference(
      'diplomaTemplateId',
      params.diplomaTemplateId,
      base.diplomaTemplateId ?? '',
    ),
    closingTemplateId: await resolvedReference(
      'closingTemplateId',
      params.closingTemplateId,
      base.closingTemplateId ?? '',
    ),
    ...statusPolicyFor(params, base),
    archivedAt: archivedAtFor(params.archived, before?.archived ?? false),
    // Nobody's staff profile: the preset was saved by a token, and the audit
    // row already carries which one.
    actorId: null,
  });

  return { applied: true, before, after: { ...template, replaced: updated } };
}
