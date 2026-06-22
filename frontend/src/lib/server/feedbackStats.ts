import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { getFormGraphById } from '$lib/server/feedbackForms';

/**
 * Aggregation for the feedback dashboards (dev "Bilan" page + admin views).
 * Option counts are a `groupBy(optionId)`, so renaming an option label never
 * changes a count: answers reference the option id, not its text.
 */

export interface OptionStat {
  optionId: string;
  label: string;
  kind: string;
  count: number;
}

export interface QuestionStat {
  questionId: string;
  key: string;
  prompt: string;
  type: string;
  identity: boolean;
  options: OptionStat[];
  freeTexts: string[];
  answeredCount: number;
}

export interface FormStats {
  formId: string;
  title: string;
  totalSubmissions: number;
  authSubmissions: number;
  publicSubmissions: number;
  questions: QuestionStat[];
}

/**
 * Restricts aggregation. `eventId` scopes to one event (the dev page); `eventIds`
 * scopes to a set of events. `campusName` scopes to one campus across BOTH
 * channels: authenticated submissions through their event's campus, and public
 * submissions through their self-reported campus label. With no scope, every
 * submission of the form counts (authenticated + public).
 */
export interface StatsScope {
  eventId?: string;
  eventIds?: string[];
  campusName?: string;
}

/** The single submission filter shared by stats, the respondent list, and CSV. */
export function buildSubmissionWhere(
  formId: string,
  scope: StatsScope = {},
): Prisma.Feedback_SubmissionWhereInput {
  return {
    formId,
    ...(scope.eventId ? { eventId: scope.eventId } : {}),
    ...(scope.eventIds ? { eventId: { in: scope.eventIds } } : {}),
    ...(scope.campusName
      ? {
          OR: [
            { event: { campus: { name: scope.campusName } } },
            { respondentCampusLabel: scope.campusName },
          ],
        }
      : {}),
  };
}

export async function computeFormStats(
  formId: string,
  scope: StatsScope = {},
): Promise<FormStats | null> {
  const graph = await getFormGraphById(formId);
  if (!graph) return null;

  const submissionWhere = buildSubmissionWhere(formId, scope);

  const [
    totalSubmissions,
    publicSubmissions,
    optionCounts,
    answerCounts,
    freeTextRows,
  ] = await Promise.all([
    prisma.feedback_Submission.count({ where: submissionWhere }),
    prisma.feedback_Submission.count({
      where: { ...submissionWhere, source: 'public' },
    }),
    prisma.feedback_AnswerOption.groupBy({
      by: ['optionId'],
      where: { answer: { submission: submissionWhere } },
      _count: { _all: true },
    }),
    prisma.feedback_Answer.groupBy({
      by: ['questionId'],
      where: { submission: submissionWhere },
      _count: { _all: true },
    }),
    prisma.feedback_Answer.findMany({
      where: {
        submission: submissionWhere,
        question: { type: { in: ['text', 'textarea'] } },
        freeText: { not: null },
      },
      select: { questionId: true, freeText: true },
    }),
  ]);

  const countByOption = new Map(
    optionCounts.map((r) => [r.optionId, r._count._all]),
  );
  const countByQuestion = new Map(
    answerCounts.map((r) => [r.questionId, r._count._all]),
  );
  const freeByQuestion = new Map<string, string[]>();
  for (const row of freeTextRows) {
    if (!row.freeText) continue;
    const list = freeByQuestion.get(row.questionId) ?? [];
    list.push(row.freeText);
    freeByQuestion.set(row.questionId, list);
  }

  const questions: QuestionStat[] = graph.questions
    .filter((q) => q.type !== 'gate' && !q.identity)
    .map((q) => ({
      questionId: q.id,
      key: q.key,
      prompt: q.prompt,
      type: q.type,
      identity: q.identity,
      options: q.options.map((o) => ({
        optionId: o.id,
        label: o.label,
        kind: o.kind,
        count: countByOption.get(o.id) ?? 0,
      })),
      freeTexts: freeByQuestion.get(q.id) ?? [],
      answeredCount: countByQuestion.get(q.id) ?? 0,
    }));

  return {
    formId,
    title: graph.title,
    totalSubmissions,
    authSubmissions: totalSubmissions - publicSubmissions,
    publicSubmissions,
    questions,
  };
}

export interface PublicRespondent {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  campusLabel: string | null;
  submittedAt: string;
}

/**
 * Public (unauthenticated) respondents for a form, the raw material for the
 * later email-keyed reconciliation to a Talent. Authenticated submissions are
 * already linked to an account, so they are excluded.
 */
export async function getPublicRespondents(
  formId: string,
  scope: StatsScope = {},
): Promise<PublicRespondent[]> {
  const rows = await prisma.feedback_Submission.findMany({
    where: { ...buildSubmissionWhere(formId, scope), source: 'public' },
    orderBy: { submittedAt: 'desc' },
    select: {
      id: true,
      respondentEmail: true,
      respondentFirstName: true,
      respondentLastName: true,
      respondentCampusLabel: true,
      submittedAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    email: r.respondentEmail,
    firstName: r.respondentFirstName,
    lastName: r.respondentLastName,
    campusLabel: r.respondentCampusLabel,
    submittedAt: r.submittedAt.toISOString(),
  }));
}

/** Talent ids that submitted the form for a given event (dev roster join). */
export async function getRespondedTalentIds(
  formId: string,
  eventId: string,
): Promise<Set<string>> {
  const rows = await prisma.feedback_Submission.findMany({
    where: {
      formId,
      eventId,
      source: 'authenticated',
      talentId: { not: null },
    },
    select: { talentId: true },
  });
  return new Set(
    rows.map((r) => r.talentId).filter((id): id is string => !!id),
  );
}
