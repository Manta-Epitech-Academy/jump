import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { validateAnswer, type Answers } from '$lib/domain/feedbackForms/schema';
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

/** Maps an identity question key to its respondent column. */
const IDENTITY_KEY_TO_COLUMN: Record<
  string,
  | 'respondentCampusLabel'
  | 'respondentCivility'
  | 'respondentLastName'
  | 'respondentFirstName'
  | 'respondentPhone'
  | 'respondentEmail'
> = {
  campus: 'respondentCampusLabel',
  civilite: 'respondentCivility',
  nom: 'respondentLastName',
  prenom: 'respondentFirstName',
  telephone: 'respondentPhone',
  mail: 'respondentEmail',
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
  const schema = toFormSchema(graph);

  // Server-side validation (the client validates too, but never trust it).
  // Mirrors the persist loop below: a `gate` only steers the conversation and
  // never carries an answer, and for authenticated submits identity is sourced
  // from the linked Talent (not the payload), so validating it here would 400 a
  // talent whose optional fields, e.g. phone, are simply absent. Identity is
  // still validated for public submits, where the respondent types it.
  const errors: string[] = [];
  for (const q of schema.questions) {
    if (q.type === 'gate') continue;
    if (q.identity && ctx.source === 'authenticated') continue;
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

    if (q.type === 'gate') continue; // control flow only, never persisted

    if (q.identity) {
      if (ctx.source === 'public') {
        const col = IDENTITY_KEY_TO_COLUMN[q.key];
        if (col) respondent[col] = asString(value);
      }
      continue; // identity never becomes an answer row
    }

    const isEmpty =
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);
    if (isEmpty) continue;

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

  return prisma.$transaction(async (tx) => {
    // Authenticated re-submit replaces the prior one (the route blocks this in
    // practice, but keep it idempotent). Public submissions never dedupe.
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
}
