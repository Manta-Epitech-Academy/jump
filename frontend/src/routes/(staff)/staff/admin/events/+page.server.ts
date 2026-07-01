import type { PageServerLoad, Actions } from './$types';
import { fail, isHttpError } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prisma } from '$lib/server/db';
import { EventService } from '$lib/server/services/events';
import { EventConfigTemplateService } from '$lib/server/services/eventConfigTemplates';
import {
  requireAdmin,
  duplicateForm,
  updateForm,
} from '$lib/server/feedbackFormsAdmin';
import {
  adminEventSchema,
  bulkEventModulesSchema,
  bulkEventActivationSchema,
  eventConfigTemplateSaveSchema,
} from '$lib/validation/events';
// The admin event view model is shared with the dashboard, so it lives on the
// service. Re-exported here so the cockpit page keeps importing it from its own
// route module.
export type { AdminEventVM } from '$lib/server/services/events';

export const load: PageServerLoad = async () => {
  const events = await EventService.listAdminEvents();

  // The feedback-form picker in the edit dialog: the published, talent-answerable
  // forms an event can be bound to, plus the title of the form that resolves by
  // default per event type (shown as the "Par défaut (…)" sentinel). One query
  // each, cross-event (the dialog reuses them for whichever row is opened).
  const [publishedForms, typeDefaults, templates] = await Promise.all([
    prisma.feedback_Form.findMany({
      // Any published, talent-answerable form is pickable for an event (forms are
      // not owned by events - an event-specific one is just a normally-named form).
      where: { status: 'published', allowsAuthenticatedAccess: true },
      select: { id: true, title: true },
      orderBy: { title: 'asc' },
    }),
    prisma.feedback_Form.findMany({
      // Only a LIVE default (published + talent-answerable) counts: it must match
      // what the dev bilan surface actually resolves (`resolvePublishedEventForm`),
      // so the wizard's "Par défaut (…)" label and its no-form warning don't claim
      // a default that a draft form would never deliver.
      where: {
        defaultForEventType: { not: null },
        status: 'published',
        allowsAuthenticatedAccess: true,
      },
      select: { id: true, defaultForEventType: true, title: true },
    }),
    EventConfigTemplateService.list(),
  ]);
  const feedbackForms = publishedForms.map((f) => ({
    value: f.id,
    label: f.title,
  }));
  // The form an event type resolves to when it sets no override: its id (to deep-
  // link the editor) + title (for the "Par défaut (…)" picker label).
  const defaultFormByType: Record<string, { id: string; title: string }> = {};
  for (const f of typeDefaults) {
    if (f.defaultForEventType)
      defaultFormByType[f.defaultForEventType] = { id: f.id, title: f.title };
  }

  // A compact, read-only preview of each pickable form (ordered question
  // prompts) so the wizard shows "what's in this form" inline before it's
  // chosen, instead of asking the admin to judge by title alone. Forms are a
  // small curated catalogue, so previewing them all up front is cheap and saves
  // a per-select round-trip. Identity questions (email/name capture) are
  // omitted: the preview is about the form's actual content.
  const previewIds = [
    ...new Set([
      ...publishedForms.map((f) => f.id),
      ...typeDefaults.map((f) => f.id),
    ]),
  ];
  const previewQuestions = await prisma.feedback_Question.findMany({
    where: { formId: { in: previewIds }, identityField: null },
    select: { formId: true, prompt: true },
    orderBy: { position: 'asc' },
  });
  const formPreviews: Record<string, string[]> = {};
  for (const q of previewQuestions) {
    (formPreviews[q.formId] ??= []).push(q.prompt);
  }

  const form = await superValidate(zod4(adminEventSchema));

  return {
    events,
    form,
    feedbackForms,
    defaultFormByType,
    templates,
    formPreviews,
  };
};

export const actions: Actions = {
  update: async ({ request }) => {
    const form = await superValidate(request, zod4(adminEventSchema));
    if (!form.valid) return fail(400, { form });

    try {
      await EventService.updateEventConfig(form.data.id, {
        publicName: form.data.publicName,
        cohortNoun: form.data.cohortNoun,
        startTime: form.data.startTime,
        endDate: form.data.endDate,
        modules: form.data.modules,
        moduleSettings: form.data.moduleSettings,
        devActivated: form.data.devActivated,
        feedbackFormId: form.data.feedbackFormId,
      });
      return message(form, 'Événement mis à jour.');
    } catch (err) {
      console.error(err);
      return message(form, 'Erreur lors de la mise à jour.', { status: 500 });
    }
  },

  // Bulk module edit over the list selection. Posted from a plain enhanced form
  // (not superform), so the payload is hand-parsed and validated here. `ids`
  // arrives comma-joined, `modules` as repeated fields.
  bulkModules: async ({ request }) => {
    const fd = await request.formData();
    const parsed = bulkEventModulesSchema.safeParse({
      ids: String(fd.get('ids') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      modules: fd.getAll('modules').map(String),
    });
    if (!parsed.success) {
      return fail(400, { bulkError: 'Sélection invalide.' });
    }

    try {
      await EventService.bulkSetModules(parsed.data.ids, parsed.data.modules);
      return { bulkCount: parsed.data.ids.length };
    } catch (err) {
      console.error(err);
      return fail(500, { bulkError: 'Erreur lors de la mise à jour groupée.' });
    }
  },

  // Bulk show/hide in the dev workspace over the selection. Same plain-form
  // parsing as bulkModules; `activate` arrives as "true"/"false".
  bulkActivation: async ({ request }) => {
    const fd = await request.formData();
    const parsed = bulkEventActivationSchema.safeParse({
      ids: String(fd.get('ids') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      activate: fd.get('activate') === 'true',
    });
    if (!parsed.success) {
      return fail(400, { bulkError: 'Sélection invalide.' });
    }

    try {
      const { activated, skipped } = await EventService.bulkSetActivation(
        parsed.data.ids,
        parsed.data.activate,
      );
      return { bulkActivated: activated, bulkSkipped: skipped };
    } catch (err) {
      console.error(err);
      return fail(500, { bulkError: 'Erreur lors de la mise à jour groupée.' });
    }
  },

  // "Enregistrer comme modèle" from the config wizard: snapshot the posted module
  // config as a new global EventConfig_Template. Plain enhanced form - name +
  // description + a JSON `config` blob (modules + per-module settings + default
  // feedback form), since the config is nested.
  saveAsTemplate: async ({ request, locals }) => {
    const fd = await request.formData();
    let config: unknown;
    try {
      config = JSON.parse(String(fd.get('config') ?? '{}'));
    } catch {
      return fail(400, { templateError: 'Configuration invalide.' });
    }
    const parsed = eventConfigTemplateSaveSchema.safeParse({
      name: fd.get('name'),
      description: fd.get('description') ?? '',
      ...(config as Record<string, unknown>),
    });
    if (!parsed.success) {
      return fail(400, {
        templateError: parsed.error.issues[0]?.message ?? 'Modèle invalide.',
      });
    }
    try {
      const { id, updated } = await EventConfigTemplateService.saveTemplate({
        ...parsed.data,
        actorId: locals.staffProfile?.id ?? null,
      });
      return {
        templateId: id,
        templateName: parsed.data.name,
        templateUpdated: updated,
      };
    } catch (err) {
      if (isHttpError(err)) {
        return fail(err.status, { templateError: String(err.body.message) });
      }
      console.error(err);
      return fail(500, {
        templateError: "Erreur lors de l'enregistrement du modèle.",
      });
    }
  },

  // Delete a config template from the wizard's step 1. The list is managed
  // optimistically client-side, so this just removes the row server-side.
  deleteTemplate: async ({ request }) => {
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '').trim();
    if (!id) return fail(400, { templateError: 'Modèle manquant.' });
    try {
      await EventConfigTemplateService.remove(id);
      return { ok: true };
    } catch (err) {
      console.error(err);
      return fail(500, { templateError: 'Erreur lors de la suppression.' });
    }
  },

  // "Dupliquer" from the feedback sub-option: deep-clone the chosen form so the
  // admin can branch it for this event without touching the shared original.
  // The copy is published + answerable from birth (it mirrors an already-live
  // form and is meant to be used right away), and stays a normal catalogue form
  // - no event ownership. The wizard binds the event to it client-side and the
  // copy becomes selectable like any other form; the admin renames/edits it in
  // the builder.
  duplicateFeedbackForm: async ({ request, locals }) => {
    const { staffId } = requireAdmin(locals);
    const fd = await request.formData();
    const sourceId = String(fd.get('sourceId') ?? '').trim();
    if (!sourceId) {
      return fail(400, { feedbackFormError: 'Formulaire source manquant.' });
    }
    try {
      const { id } = await duplicateForm(staffId, sourceId);
      await updateForm(staffId, id, {
        status: 'published',
        allowsAuthenticatedAccess: true,
      });
      const copy = await prisma.feedback_Form.findUniqueOrThrow({
        where: { id },
        select: { title: true },
      });
      return { duplicatedFormId: id, duplicatedFormTitle: copy.title };
    } catch (err) {
      if (isHttpError(err)) {
        return fail(err.status, {
          feedbackFormError: String(err.body.message),
        });
      }
      console.error(err);
      return fail(500, {
        feedbackFormError: 'Erreur lors de la duplication du formulaire.',
      });
    }
  },
};
