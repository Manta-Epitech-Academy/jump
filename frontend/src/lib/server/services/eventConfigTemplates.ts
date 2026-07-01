import { error } from '@sveltejs/kit';
import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { hhmmToMinutes, minutesToHHMM } from '$lib/domain/event';
import {
  isEventModuleKey,
  parseModuleSettings,
  type EventModuleKey,
} from '$lib/domain/eventModules';

/**
 * Service for `EventConfig_Template` - reusable, named, global event-config
 * presets, all created by staff from the config wizard. Applying one is a
 * point-in-time SEED into an event (the wizard prefills from `summary`, the save
 * writes the event's own rows); there is no live link back. Saving snapshots the
 * current wizard config; the name is globally unique, so saving with an existing
 * name UPDATES that template (that's how a template is edited). The shape mirrors
 * `EventConfig_Module` (presence + `settings`), so both directions are a plain
 * row copy. See src/lib/domain/eventModules.ts.
 */
export type EventConfigTemplateSummary = {
  id: string;
  name: string;
  description: string | null;
  /** Soft hint: the SF event type the wizard suggests this template for. */
  forEventType: string | null;
  /** Friendly event name the preset prefills, or null (event keeps the SF titre). */
  publicName: string | null;
  /** Cohort noun the preset prefills ("stagiaire", ...), or null when unnamed. */
  cohortNoun: string | null;
  /** Arrival time-of-day the preset prefills as "HH:MM", or "" when unset. */
  startTime: string;
  /** Optional default feedback form (weak FK), prefilled when bilan is enabled. */
  feedbackFormId: string | null;
  modules: EventModuleKey[];
  /** Per-module sub-options, keyed by module key (fully defaulted). */
  moduleSettings: Record<string, unknown>;
};

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  forEventType: string | null;
  publicName: string | null;
  cohortNoun: string | null;
  startMinutes: number | null;
  feedbackFormId: string | null;
  modules: { moduleKey: string; settings: Prisma.JsonValue }[];
};

const TEMPLATE_INCLUDE = {
  modules: { select: { moduleKey: true, settings: true } },
} satisfies Prisma.EventConfig_TemplateInclude;

function toSummary(t: TemplateRow): EventConfigTemplateSummary {
  const present = t.modules.filter((m) => isEventModuleKey(m.moduleKey));
  const moduleSettings: Record<string, unknown> = {};
  for (const m of present) {
    const key = m.moduleKey as EventModuleKey;
    moduleSettings[key] = parseModuleSettings(key, m.settings);
  }
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    forEventType: t.forEventType,
    publicName: t.publicName,
    cohortNoun: t.cohortNoun,
    startTime: minutesToHHMM(t.startMinutes),
    feedbackFormId: t.feedbackFormId,
    modules: present.map((m) => m.moduleKey as EventModuleKey),
    moduleSettings,
  };
}

/** Validate a feedback form id (empty → null), so a template can't point at a ghost. */
async function resolveFeedbackFormId(raw: string): Promise<string | null> {
  const id = raw.trim();
  if (!id) return null;
  const form = await prisma.feedback_Form.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!form) throw error(400, 'Formulaire de feedback introuvable.');
  return id;
}

/** Build the template's module child rows from a config snapshot (validated per module). */
function moduleCreateRows(
  modules: string[],
  moduleSettings: Record<string, unknown>,
): { moduleKey: string; settings: Prisma.InputJsonValue }[] {
  const desired = [
    ...new Set(modules.filter(isEventModuleKey)),
  ] as EventModuleKey[];
  return desired.map((moduleKey) => ({
    moduleKey,
    settings: parseModuleSettings(
      moduleKey,
      moduleSettings[moduleKey],
    ) as Prisma.InputJsonValue,
  }));
}

export const EventConfigTemplateService = {
  /** All templates, alphabetical - the global catalogue the wizard offers. */
  async list(): Promise<EventConfigTemplateSummary[]> {
    const rows = await prisma.eventConfig_Template.findMany({
      orderBy: { name: 'asc' },
      include: TEMPLATE_INCLUDE,
    });
    return rows.map(toSummary);
  },

  /**
   * Snapshot the current wizard config as a template. UPSERT by name: a new name
   * creates one, an existing name replaces that template's config in place (its
   * id stays), so re-saving under the same name is how staff edit a template.
   * `forEventType` is captured from the event so the template is later suggested
   * for events of the same type.
   */
  async saveTemplate(input: {
    name: string;
    description: string;
    forEventType: string;
    publicName: string;
    cohortNoun: string;
    startTime: string;
    modules: string[];
    moduleSettings: Record<string, unknown>;
    feedbackFormId: string;
    actorId: string | null;
  }): Promise<{ id: string; updated: boolean }> {
    const name = input.name.trim();
    if (!name) throw error(400, 'Nom de modèle requis.');
    const feedbackFormId = await resolveFeedbackFormId(input.feedbackFormId);
    const forEventType = input.forEventType.trim() || null;
    const description = input.description.trim() || null;
    const publicName = input.publicName.trim() || null;
    const cohortNoun = input.cohortNoun.trim() || null;
    const startMinutes = hhmmToMinutes(input.startTime);
    const moduleRows = moduleCreateRows(input.modules, input.moduleSettings);

    const existing = await prisma.eventConfig_Template.findUnique({
      where: { name },
      select: { id: true },
    });

    if (existing) {
      // Replace the config wholesale (drop old module rows, recreate) in one tx.
      await prisma.$transaction([
        prisma.eventConfig_TemplateModule.deleteMany({
          where: { templateId: existing.id },
        }),
        prisma.eventConfig_Template.update({
          where: { id: existing.id },
          data: {
            description,
            forEventType,
            publicName,
            cohortNoun,
            startMinutes,
            feedbackFormId,
            modules: { create: moduleRows },
          },
        }),
      ]);
      return { id: existing.id, updated: true };
    }

    const created = await prisma.eventConfig_Template.create({
      data: {
        name,
        description,
        forEventType,
        publicName,
        cohortNoun,
        startMinutes,
        feedbackFormId,
        createdById: input.actorId,
        modules: { create: moduleRows },
      },
      select: { id: true },
    });
    return { id: created.id, updated: false };
  },

  /** Delete a template. Events keep their own config (a template is never a live link). */
  async remove(id: string): Promise<void> {
    await prisma.eventConfig_Template.delete({ where: { id } });
  },
};
