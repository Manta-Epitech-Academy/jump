import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import {
  eventSchema,
  startTimeSchema,
  eventModulesSchema,
  eventFeedbackFormSchema,
} from '$lib/validation/events';
import { EventService } from '$lib/server/services/events';
import { getCampusId, getCampusTimezone } from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { eventTypeHasTheme } from '$lib/domain/event';
import {
  presetModulesForType,
  eventHasModule,
  EVENT_MODULES,
} from '$lib/domain/eventModules';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import { prisma } from '$lib/server/db';

/**
 * The event "Paramètres" surface: the dev-lead config home for a single event.
 * It carries the per-event module toggles (which dev-workspace surfaces this
 * event exposes), the arrival time, and the staff notes. It is intentionally
 * lean — the cohort dashboards live on the individual surfaces (Inscrits,
 * Émargement, …), not here.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(params.id, campusId);
  const canHaveTheme = eventTypeHasTheme(event.eventType);

  // Notes + theme aren't part of the shared EventRecord (only this surface edits
  // them), so fetch them here. Themes only matter for theme-carrying types.
  const [meta, themes] = await Promise.all([
    prisma.event.findUniqueOrThrow({
      where: { id: event.id },
      select: { notes: true, theme: { select: { nom: true } } },
    }),
    canHaveTheme
      ? prisma.theme.findMany({ orderBy: { nom: 'asc' } })
      : Promise.resolve([]),
  ]);

  const editForm = await superValidate(
    { theme: meta.theme?.nom ?? '', notes: meta.notes ?? '' },
    zod4(eventSchema),
  );
  const modulesForm = await superValidate(
    { modules: [...event.modules] },
    zod4(eventModulesSchema),
  );

  // The feedback-form picker only matters when the event exposes the bilan
  // surface; resolve its options lazily so other events pay nothing for it.
  const hasBilan = eventHasModule(event.modules, EVENT_MODULES.BILAN);
  let feedbackForms: { value: string; label: string }[] = [];
  let defaultFormTitle: string | null = null;
  let feedbackFormForm = null;
  if (hasBilan) {
    const [published, typeDefault] = await Promise.all([
      // Live forms the event can use (published + answerable by connected
      // talents). The currently-attached form is appended below if it has since
      // dropped out of this set, so the select never shows a stale empty value.
      prisma.feedback_Form.findMany({
        where: { status: 'published', allowsAuthenticatedAccess: true },
        select: { id: true, title: true },
        orderBy: { title: 'asc' },
      }),
      prisma.feedback_Form.findUnique({
        where: { defaultForEventType: event.eventType },
        select: { title: true },
      }),
    ]);
    defaultFormTitle = typeDefault?.title ?? null;
    feedbackForms = published.map((f) => ({ value: f.id, label: f.title }));
    if (
      event.feedbackFormId &&
      !feedbackForms.some((f) => f.value === event.feedbackFormId)
    ) {
      const attached = await prisma.feedback_Form.findUnique({
        where: { id: event.feedbackFormId },
        select: { id: true, title: true },
      });
      if (attached)
        feedbackForms.unshift({ value: attached.id, label: attached.title });
    }
    feedbackFormForm = await superValidate(
      { feedbackFormId: event.feedbackFormId ?? '' },
      zod4(eventFeedbackFormSchema),
    );
  }

  return {
    event,
    canHaveTheme,
    themes,
    editForm,
    modulesForm,
    hasBilan,
    feedbackForms,
    defaultFormTitle,
    feedbackFormForm,
    presetModules: presetModulesForType(event.eventType),
    timezone: getCampusTimezone(locals),
  };
};

export const actions: Actions = {
  updateEvent: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devLead');
    const form = await superValidate(request, zod4(eventSchema));
    if (!form.valid) return fail(400, { form });
    await EventService.updateEvent(params.id, getCampusId(locals), form.data);
    return message(form, 'Notes enregistrées.');
  },

  // Focused writer for the Jump-owned start time-of-day (its own action so
  // editing notes/modules can never touch it). Empty clears it to the default.
  setStartTime: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devLead');
    const form = await superValidate(request, zod4(startTimeSchema));
    if (!form.valid) return fail(400, { form });
    await EventService.setStartTime(
      params.id,
      getCampusId(locals),
      form.data.startTime,
    );
    return message(form, 'Horaire enregistré.');
  },

  setEventModules: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devLead');
    const form = await superValidate(request, zod4(eventModulesSchema));
    if (!form.valid) return fail(400, { form });
    await EventService.setEventModules(
      params.id,
      getCampusId(locals),
      form.data.modules,
    );
    return message(form, 'Modules enregistrés.');
  },

  setEventFeedbackForm: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devLead');
    const form = await superValidate(request, zod4(eventFeedbackFormSchema));
    if (!form.valid) return fail(400, { form });
    await EventService.setEventFeedbackForm(
      params.id,
      getCampusId(locals),
      form.data.feedbackFormId,
    );
    return message(form, 'Formulaire enregistré.');
  },
};
