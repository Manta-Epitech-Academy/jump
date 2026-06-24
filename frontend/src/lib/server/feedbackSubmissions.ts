import { error } from '@sveltejs/kit';
import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import {
  validateAnswer,
  isEmptyAnswer,
  type Answers,
  type IdentityField,
} from '$lib/domain/feedbackForms/schema';
import {
  toFormSchema,
  type FeedbackFormGraph,
} from '$lib/server/feedbackForms';

/**
 * Translates the UI `Answers` map (keyed by question key, values = label or
 * label[]) into the normalized response tree (Feedback_Submission ->
 * Feedback_Answer -> Feedback_AnswerOption), in one transaction.
 *
 * Identity questions never become answer rows: for public submissions they feed
 * the submission's respondent columns; for authenticated ones identity is read
 * from the linked Talent, so they are dropped here.
 */

/** Maps an identity field to its respondent column. */
const IDENTITY_FIELD_TO_COLUMN: Record<
  IdentityField,
  | 'respondentCampusLabel'
  | 'respondentCivility'
  | 'respondentLastName'
  | 'respondentFirstName'
  | 'respondentPhone'
  | 'respondentEmail'
> = {
  campus: 'respondentCampusLabel',
  civility: 'respondentCivility',
  lastName: 'respondentLastName',
  firstName: 'respondentFirstName',
  phone: 'respondentPhone',
  email: 'respondentEmail',
};

export type SubmissionContext =
  | { source: 'authenticated'; talentId: string; eventId: string }
  | { source: 'public' };

function asString(v: Answers[string] | undefined): string | null {
  if (v == null) return null;
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() !== '' ? s.trim() : null;
}

export async function recordSubmission(
  graph: FeedbackFormGraph,
  answers: Answers,
  ctx: SubmissionContext,
): Promise<{ id: string }> {
  // Project for the actual audience: authenticated submits never receive identity
  // questions (Jump holds that data), so they're absent from `schema.questions`
  // here and never validated; public submits get them and validate as required.
  const schema = toFormSchema(graph, ctx.source);

  // Server-side validation (the client validates too, but never trust it).
  const errors: string[] = [];
  for (const q of schema.questions) {
    const err = validateAnswer(q, answers[q.id]);
    if (err) errors.push(`${q.id}: ${err}`);
  }
  if (errors.length > 0) {
    throw error(400, `Réponses invalides : ${errors.join(' ; ')}`);
  }

  // Resolve label -> optionId per question, across every option kind (a scale's
  // "extra" option is a legitimate answer too).
  const optionIdByQuestionLabel = new Map<string, Map<string, string>>();
  for (const q of graph.questions) {
    const m = new Map<string, string>();
    for (const o of q.options) m.set(o.label, o.id);
    optionIdByQuestionLabel.set(q.id, m);
  }

  const respondent: Record<string, string | null> = {};
  type AnswerRow = {
    questionId: string;
    freeText: string | null;
    optionIds: string[];
  };
  const answerRows: AnswerRow[] = [];

  for (const q of graph.questions) {
    const value = answers[q.key];

    if (q.identityField) {
      // Identity routes into a typed respondent column for public submits;
      // authenticated identity is read from the linked Talent, never the payload.
      if (ctx.source === 'public') {
        respondent[IDENTITY_FIELD_TO_COLUMN[q.identityField]] = asString(value);
      }
      continue; // identity never becomes an answer row
    }

    if (isEmptyAnswer(value)) continue;

    if (q.type === 'text' || q.type === 'textarea') {
      answerRows.push({
        questionId: q.id,
        freeText: Array.isArray(value) ? value.join(', ') : value,
        optionIds: [],
      });
      continue;
    }

    const labelMap = optionIdByQuestionLabel.get(q.id);
    const labels = Array.isArray(value) ? value : [value];
    const matched: string[] = [];
    for (const label of labels) {
      const optId = labelMap?.get(label);
      if (optId) matched.push(optId);
    }
    // Non-`multiple` types record a single selection; dedupe so a repeated label
    // can't violate the (answerId, optionId) composite PK and 500 the submit.
    const optionIds = [
      ...new Set(q.type === 'multiple' ? matched : matched.slice(0, 1)),
    ];
    if (optionIds.length > 0) {
      answerRows.push({ questionId: q.id, freeText: null, optionIds });
    }
  }

  if (ctx.source === 'public' && !respondent.respondentEmail) {
    throw error(400, 'Une adresse e-mail est requise.');
  }

  const data = {
    formId: graph.id,
    source: ctx.source,
    talentId: ctx.source === 'authenticated' ? ctx.talentId : null,
    eventId: ctx.source === 'authenticated' ? ctx.eventId : null,
    respondentEmail: respondent.respondentEmail ?? null,
    respondentFirstName: respondent.respondentFirstName ?? null,
    respondentLastName: respondent.respondentLastName ?? null,
    respondentPhone: respondent.respondentPhone ?? null,
    respondentCivility: respondent.respondentCivility ?? null,
    respondentCampusLabel: respondent.respondentCampusLabel ?? null,
    answers: {
      create: answerRows.map((a) => ({
        questionId: a.questionId,
        freeText: a.freeText,
        selectedOptions:
          a.optionIds.length > 0
            ? { create: a.optionIds.map((optionId) => ({ optionId })) }
            : undefined,
      })),
    },
  };

  try {
    return await prisma.$transaction(async (tx) => {
      // Authenticated re-submit replaces the prior one (the page redirects an
      // already-submitted talent, so this is the rare double-tab / retry case).
      // Public submissions never dedupe.
      if (ctx.source === 'authenticated') {
        await tx.feedback_Submission.deleteMany({
          where: {
            formId: graph.id,
            eventId: ctx.eventId,
            talentId: ctx.talentId,
          },
        });
      }
      return tx.feedback_Submission.create({ data, select: { id: true } });
    });
  } catch (e) {
    // Two concurrent authenticated submits for the same (form, event, talent)
    // can race the delete + create against the unique index; the loser hits
    // P2002. The winner's row is already persisted, so this is an idempotent
    // success, not a 500 - return the row that won.
    if (
      ctx.source === 'authenticated' &&
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      const existing = await prisma.feedback_Submission.findUnique({
        where: {
          formId_eventId_talentId: {
            formId: graph.id,
            eventId: ctx.eventId,
            talentId: ctx.talentId,
          },
        },
        select: { id: true },
      });
      if (existing) return existing;
    }
    throw e;
  }
}
