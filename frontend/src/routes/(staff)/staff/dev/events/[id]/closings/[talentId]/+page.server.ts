import { error, fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { PageServerLoad, Actions, RequestEvent } from './$types';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { prisma } from '$lib/server/db';
import {
  loadEventOr404,
  requireEventModule,
} from '$lib/server/services/stageContext';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { resolveClosingGridById } from '$lib/server/closingTemplates';
import {
  gridQuestions,
  recordSynthesisSections,
  type StoredClosingQuestion,
} from '$lib/domain/closing';
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
      // The bank row behind the answer, so an answer to a question the grid no
      // longer asks can still be rendered under its own wording. An answer
      // references the bank, never the composition, precisely so that dropping a
      // question cannot hide what was recorded.
      question: {
        select: {
          id: true,
          key: true,
          label: true,
          hint: true,
          kind: true,
          max: true,
          maxLength: true,
          placeholder: true,
          notePlaceholder: true,
          testimonial: true,
          options: {
            orderBy: { position: 'asc' },
            select: {
              id: true,
              value: true,
              label: true,
              tone: true,
              icon: true,
            },
          },
        },
      },
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
  // pair `bilan` is gated on. Without a grid there is nothing to ask, and the
  // null FK IS that gate - no query needed to ask it.
  if (!event.closingTemplateId) {
    throw error(
      404,
      "Aucune grille de closing n'est configurée pour cet événement.",
    );
  }

  // The roster is still read from `Participation` - Salesforce owns who is
  // enrolled - but the record is addressed by (talent, event), so a closing
  // whose enrolment the sync has since pruned stays reachable here instead of
  // 404ing on a row that no longer exists.
  const key = { talentId: params.talentId, eventId: event.id };
  const [participation, record] = await Promise.all([
    db.participation.findUnique({
      where: { talentId_eventId: key },
      select: { talentId: true },
    }),
    db.closing_Record.findUnique({
      where: { talentId_eventId: key },
      include: RECORD_INCLUDE,
    }),
  ]);

  // Either tie will do, and accepting the record alone is the point: Salesforce
  // prunes an enrolment it no longer carries, and a closing already conducted
  // must stay readable afterwards rather than 404 on a row that has gone.
  if (!participation && !record) {
    throw error(404, 'Participant introuvable pour cet événement.');
  }

  const talent = await prisma.talent.findUnique({
    where: { id: params.talentId },
    select: { id: true, nom: true, prenom: true },
  });
  if (!talent) throw error(404, 'Talent introuvable.');

  // A record answers against the grid it PINNED, never the one its event points
  // at today, which is the whole reason `Closing_Record.templateId` is a column.
  // The event's grid only decides what a closing not yet started will ask, and
  // gates the surface above; from here on the record decides, exactly as the
  // action does. Read off the event instead and retargeting an event would
  // silently re-render every closing already conducted on it.
  const grid = await resolveClosingGridById(
    record?.templateId ?? event.closingTemplateId,
  );
  if (!grid) {
    throw error(404, 'Grille de closing introuvable pour ce closing.');
  }

  // Prefill from the answer rows, keyed by bank question id - the same key the
  // form posts back, so there is no column list to keep in step here.
  //
  // Split in two, and the split is load-bearing. The form carries only what the
  // grid asks, because `closingAnswersIssues` refuses an answer to a question
  // the grid does not ask and the action returns 400 before persisting: leave a
  // dropped question's answer in the form and every autosave fails for good.
  // What it dropped goes to the synthesis instead, read-only, under its own
  // heading.
  const asked = new Set(gridQuestions(grid).map((q) => q.id));
  const answers: ClosingConductForm['answers'] = {};
  const retiredAnswers: ClosingConductForm['answers'] = {};
  const retiredQuestions: StoredClosingQuestion[] = [];

  for (const a of record?.answers ?? []) {
    const answer = {
      selectedIds: a.selectedOptions.map((s) => s.optionId),
      ratingValue: a.ratingValue,
      freeText: a.freeText ?? '',
      note: a.note ?? '',
    };
    if (asked.has(a.questionId)) {
      answers[a.questionId] = answer;
    } else {
      retiredAnswers[a.questionId] = answer;
      retiredQuestions.push(a.question);
    }
  }

  const form = await superValidate(
    {
      talentId: params.talentId,
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
    // What the synthesis reads back: the grid's own sections, plus one carrying
    // anything recorded against a question the composition has since dropped.
    synthesisSections: recordSynthesisSections(grid, retiredQuestions),
    retiredAnswers,
    form,
    talentId: talent.id,
    // The person, not just their name: the header draws the same monogram the
    // fiche does, so the two pages are visibly about the same human.
    talent,
    talentName: formatPersonName(talent.prenom, talent.nom),
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
    where: {
      talentId_eventId: { talentId: params.talentId, eventId: event.id },
    },
    select: { campusId: true },
  });
  if (
    form.data.talentId !== params.talentId ||
    !participation ||
    participation.campusId !== campusId
  ) {
    return message(form, 'Closing impossible pour ce participant.', {
      status: 400,
    });
  }

  const existing = await db.closing_Record.findUnique({
    where: {
      talentId_eventId: { talentId: params.talentId, eventId: event.id },
    },
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
  const templateId = existing?.templateId ?? event.closingTemplateId;
  const grid = templateId ? await resolveClosingGridById(templateId) : null;
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
    talentId: params.talentId,
    eventId: event.id,
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
