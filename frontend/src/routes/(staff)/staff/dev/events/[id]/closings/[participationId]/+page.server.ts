import { error, fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { PageServerLoad, Actions, RequestEvent } from './$types';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import {
  loadEventOr404,
  requireEventModule,
} from '$lib/server/services/stageContext';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { resolveEventClosingGrid } from '$lib/server/closingTemplates';
import {
  closingAnswersIssues,
  closingConductSchema,
  type ClosingConductForm,
} from '$lib/validation/closings';
import {
  persistClosing,
  type ClosingMode,
} from '$lib/server/services/closingService';
import { formatPersonName } from '$lib/domain/profile';

/**
 * Conducting one closing, on its own page under its event.
 *
 * A closing is an event-scoped act, so this is where it happens - not on the
 * talent fiche, which used to host it behind a shallow-routed toggle. The fiche
 * now reads closings back and links here.
 *
 * The grid comes from the event, and the record pins the grid it was started
 * with, so retargeting an event never changes how a closing already conducted
 * reads back.
 */

const RECORD_INCLUDE = {
  staff: { select: { user: { select: { name: true, image: true } } } },
  answers: {
    select: {
      questionId: true,
      ratingValue: true,
      freeText: true,
      note: true,
      selectedOptions: { select: { optionId: true } },
    },
  },
} as const;

export const load: PageServerLoad = async ({ params, locals }) => {
  requireStaffGroup(locals, 'devMember');
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(params.id, campusId);
  requireEventModule(event, EVENT_MODULES.CLOSINGS);
  const db = scopedPrisma(campusId);

  // The surface is gated on the module AND on the event naming a grid, the same
  // pair `bilan` is gated on. Without a grid there is nothing to ask.
  const grid = await resolveEventClosingGrid(event);
  if (!grid) {
    throw error(
      404,
      "Aucune grille de closing n'est configurée pour cet événement.",
    );
  }

  const participation = await db.participation.findUnique({
    where: { id: params.participationId },
    select: {
      id: true,
      eventId: true,
      talent: { select: { id: true, nom: true, prenom: true } },
    },
  });
  if (!participation || participation.eventId !== event.id) {
    throw error(404, 'Participant introuvable pour cet événement.');
  }

  const record = await db.closing_Record.findUnique({
    where: { participationId: participation.id },
    include: RECORD_INCLUDE,
  });

  // Prefill from the answer rows, keyed by bank question id - the same key the
  // form posts back, so there is no column list to keep in step here.
  const answers: ClosingConductForm['answers'] = {};
  for (const a of record?.answers ?? []) {
    answers[a.questionId] = {
      selectedIds: a.selectedOptions.map((s) => s.optionId),
      ratingValue: a.ratingValue,
      freeText: a.freeText ?? '',
      note: a.note ?? '',
    };
  }

  const form = await superValidate(
    {
      participationId: participation.id,
      answers,
      recommendation: record?.recommendation ?? null,
      verdictNote: record?.verdictNote ?? '',
    },
    zod4(closingConductSchema),
  );

  const timezone = getCampusTimezone(locals);
  const conductedLabel = record
    ? new Intl.DateTimeFormat('fr-FR', {
        timeZone: timezone,
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(record.conductedAt)
    : null;

  return {
    event: {
      id: event.id,
      titre: event.titre,
      publicName: event.publicName,
    },
    grid,
    form,
    talentId: participation.talent.id,
    talentName: formatPersonName(
      participation.talent.prenom,
      participation.talent.nom,
    ),
    status: record?.status ?? null,
    conductedLabel: record?.status === 'done' ? conductedLabel : null,
    conductedBy: record?.staff.user?.name ?? null,
    conductedByImage: record?.staff.user?.image ?? null,
  };
};

/**
 * One handler behind the three lifecycle actions:
 *   - `start`  → create the row `in_progress` (the "Démarrer le closing" CTA)
 *   - `save`   → autosave answers, status unchanged
 *   - `close`  → flip to `done` (the "Clôturer le closing" CTA)
 *
 * Clôture is a one-way door: a `done` closing is locked for good (guarded
 * below), so the lifecycle only ever runs null → in_progress → done. Dev-only,
 * and re-validated per participation on its event's module and grid.
 */
async function persist(
  { request, locals, params }: RequestEvent,
  mode: ClosingMode,
) {
  requireStaffGroup(locals, 'devMember');

  const campusId = getCampusId(locals);
  const db = scopedPrisma(campusId);

  const form = await superValidate(request, zod4(closingConductSchema));
  if (!form.valid) return fail(400, { form });

  const event = await loadEventOr404(params.id, campusId);
  requireEventModule(event, EVENT_MODULES.CLOSINGS);

  const participation = await db.participation.findUnique({
    where: { id: form.data.participationId },
    select: { id: true, eventId: true, talentId: true, campusId: true },
  });
  if (
    !participation ||
    participation.id !== params.participationId ||
    participation.eventId !== event.id ||
    participation.campusId !== campusId
  ) {
    return message(form, 'Closing impossible pour ce participant.', {
      status: 400,
    });
  }

  const existing = await db.closing_Record.findUnique({
    where: { participationId: participation.id },
    select: { status: true, templateId: true },
  });

  // Clôture is terminal: once `done`, the closing is locked for good. Refuse any
  // further mutation (autosave, re-close, or a stray start) server-side so the
  // lock holds even against a replayed or hand-crafted POST, not just the
  // removed UI controls.
  if (existing?.status === 'done') {
    return message(
      form,
      'Ce closing est finalisé et ne peut plus être modifié.',
      { status: 409 },
    );
  }

  // An open record answers against the grid it was STARTED with; a new one takes
  // the event's current grid. Retargeting an event mid-closing must not silently
  // change the questions under the person conducting it.
  const grid = existing
    ? await resolveEventClosingGrid({ closingTemplateId: existing.templateId })
    : await resolveEventClosingGrid(event);
  if (!grid) {
    return message(
      form,
      "Aucune grille de closing n'est configurée pour cet événement.",
      { status: 400 },
    );
  }

  // Everything the grid decides, checked against the grid rather than the
  // schema: a question it does not ask, an option it does not offer, a rating
  // off its own scale. None of these is reachable through the UI, so they exist
  // to make a stale tab fail loudly rather than write an unreadable answer.
  const issues = closingAnswersIssues(form.data, grid);
  if (issues.length > 0) {
    return message(form, issues[0].message, { status: 400 });
  }

  await persistClosing({
    participationId: participation.id,
    talentId: participation.talentId,
    campusId,
    staffId: locals.staffProfile.id,
    templateId: grid.templateId,
    grid,
    form: form.data,
    mode,
  });

  // Success carries no flash: the conduct UI signals each lifecycle outcome
  // through its view transition (cover ⇆ questions ⇆ synthèse), not a toast.
  return { form };
}

export const actions: Actions = {
  start: (event) => persist(event, 'start'),
  save: (event) => persist(event, 'save'),
  close: (event) => persist(event, 'close'),
};
