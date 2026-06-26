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
 * scopes to a set of events; `noEvent` scopes to the submissions tied to no event
 * (public responses, whose `eventId` is null) — these are mutually exclusive ways
 * to pick the event axis. `campusName` scopes to one campus across BOTH channels:
 * authenticated submissions through their event's campus, and public submissions
 * through their self-reported campus label. With no scope, every submission of
 * the form counts (authenticated + public, every event).
 */
export interface StatsScope {
  eventId?: string;
  eventIds?: string[];
  /** Only submissions with no event (the public, hors-événement bucket). */
  noEvent?: boolean;
  campusName?: string;
}

/**
 * Maps the admin responses page's `event` axis param ('all' | 'public' | an
 * event id) to the event filter of a {@link StatsScope}. Single-sourced so the
 * page load and the CSV export resolve the same slice and can never drift on how
 * the param is interpreted.
 */
export function eventAxisScope(
  eventParam: string,
): Pick<StatsScope, 'eventId' | 'noEvent'> {
  if (eventParam === 'public') return { noEvent: true };
  if (eventParam !== 'all') return { eventId: eventParam };
  return {};
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
    ...(scope.noEvent ? { eventId: null } : {}),
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

/** The answer shape both exports include on a submission. */
interface ExportAnswer {
  questionId: string;
  freeText: string | null;
  selectedOptions: { option: { label: string } }[];
}

/**
 * Flattens a submission's answers into one cell per content column, in column
 * order. Free text wins; otherwise the selected option labels are joined. Shared
 * by the admin CSV and dev XLSX exports so the answer-rendering rule lives once
 * (the channels still own their own identity / source / campus columns).
 */
export function answerCells(
  answers: ExportAnswer[],
  columns: { id: string }[],
): string[] {
  const byQuestion = new Map<string, string>();
  for (const a of answers) {
    byQuestion.set(
      a.questionId,
      a.freeText ?? a.selectedOptions.map((s) => s.option.label).join(', '),
    );
  }
  return columns.map((q) => byQuestion.get(q.id) ?? '');
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
    .filter((q) => q.identityField == null)
    .map((q) => ({
      questionId: q.id,
      key: q.key,
      prompt: q.prompt,
      type: q.type,
      // Options come back most→least chosen so both dashboards lead with the
      // dominant answer. Stable sort: ties keep the form's canonical option order.
      // The CSV export reads the graph directly, so its columns stay canonical.
      options: q.options
        .map((o) => ({
          optionId: o.id,
          label: o.label,
          kind: o.kind,
          count: countByOption.get(o.id) ?? 0,
        }))
        .sort((a, b) => b.count - a.count),
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

/** One event's slice of a form's responses (the admin event pivot). */
export interface EventResponseBucket {
  eventId: string;
  /** Admin-set public name, else the SF titre. */
  label: string;
  campusName: string;
  /** Start day in the event's campus tz, e.g. "12 juin 2026". */
  dateLabel: string;
  /** Start epoch ms, for ordering most-recent-first. */
  dateTs: number;
  count: number;
}

export interface EventResponseBreakdown {
  /** Events with ≥1 response for the form, most recent first. */
  events: EventResponseBucket[];
  /** Responses tied to no event (public / hors-événement). */
  publicCount: number;
  /** Every counted response (sum of the buckets), within the campus scope. */
  total: number;
}

/**
 * Splits a form's responses by the event they were submitted for, so the admin
 * responses page can scope to one event ("le Coding Club de juin") instead of an
 * undifferentiated pile across every event the form is reused on. Authenticated
 * submissions carry their `eventId` (the dev page already relies on it); public
 * submissions carry none and fall into `publicCount`. Honours the `campusName`
 * scope so the breakdown narrows with the campus filter.
 */
export async function getEventResponseBreakdown(
  formId: string,
  scope: Pick<StatsScope, 'campusName'> = {},
): Promise<EventResponseBreakdown> {
  const grouped = await prisma.feedback_Submission.groupBy({
    by: ['eventId'],
    where: buildSubmissionWhere(formId, { campusName: scope.campusName }),
    _count: { _all: true },
  });

  const eventIds = grouped
    .map((g) => g.eventId)
    .filter((id): id is string => id != null);
  const events = eventIds.length
    ? await prisma.event.findMany({
        where: { id: { in: eventIds } },
        select: {
          id: true,
          titre: true,
          publicName: true,
          date: true,
          campus: { select: { name: true, timezone: true } },
        },
      })
    : [];
  const byId = new Map(events.map((e) => [e.id, e]));

  const eventBuckets: EventResponseBucket[] = [];
  let publicCount = 0;
  let total = 0;
  for (const g of grouped) {
    const count = g._count._all;
    total += count;
    if (g.eventId == null) {
      publicCount = count;
      continue;
    }
    const e = byId.get(g.eventId);
    eventBuckets.push({
      eventId: g.eventId,
      label: e ? e.publicName?.trim() || e.titre : 'Événement supprimé',
      campusName: e?.campus.name ?? '',
      dateLabel: e
        ? new Intl.DateTimeFormat('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: e.campus.timezone,
          }).format(e.date)
        : '',
      dateTs: e ? e.date.getTime() : 0,
      count,
    });
  }
  eventBuckets.sort((a, b) => b.dateTs - a.dateTs);

  return { events: eventBuckets, publicCount, total };
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
