/**
 * What the orientation interview says about a cohort.
 *
 * The single richest source the platform holds on why students come to us: how
 * they heard about the stage, what motivates them, which specialities they are
 * heading for, which tech domains they picture themselves in, how satisfied they
 * left, and whether they want to come back. All of it already collected, and
 * until now readable only one student at a time.
 *
 * The questionnaire is walked, not restated. `INTERVIEW_SECTIONS` is the single
 * source for which questions exist, what they are called in French, and which
 * options each offers, so a question added to the interview shows up here on its
 * own, with its own wording, and a renamed option cannot end up labelled one way
 * on the dev fiche and another way in a leadership answer.
 *
 * Aggregates only, and enum columns only. Every free-text field on an interview
 * (the per-question notes, the team's verdict note) is the staff's written
 * impression of a named minor and is never selected here. The one exception,
 * "le stage en une phrase", is the student's own words, deliberately collected
 * for communication, and it has its own operation.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import {
  INTERVIEW_SECTIONS,
  INTERVIEW_RECOMMENDATIONS,
  INTERVIEW_RECOMMENDATION_DISPLAY_ORDER,
  INTERVIEW_STATUS_LABELS,
  VERDICT_SECTION,
  type InterviewQuestion,
} from '$lib/domain/interview';
import { metric, share, type Metric } from '$lib/server/adminApi/metrics';
import type { Scope } from '$lib/server/adminApi/scope';
import { participationWhere, scopeLabels } from './cohort';

/** Only the answer columns: no note, no verdict, no testimonial. */
const ANSWER_SELECT = {
  status: true,
  discoveryChannel: true,
  motivation: true,
  orientationTalkAtSchool: true,
  passionateTeacher: true,
  wantsMore: true,
  recommendation: true,
  techProjection: true,
  specialties: true,
  otherJobs: true,
  infoSources: true,
  nextYearEvents: true,
  satisfactionStars: true,
} satisfies Prisma.InterviewSelect;

type AnswerRow = Prisma.InterviewGetPayload<{ select: typeof ANSWER_SELECT }>;

export type AnswerCount = {
  value: string;
  label: string;
  count: number;
  /** Percentage of the interviews that answered this question. */
  share: number | null;
};

export type QuestionInsight = {
  /** The `Interview` column, so an answer can be traced to its question. */
  field: string;
  section: string;
  question: string;
  /** `single` = one answer each, `multi` = several allowed, `rating` = stars. */
  kind: 'single' | 'multi' | 'rating';
  answered: number;
  options: AnswerCount[];
  /** Ratings only: mean of the stars given, on the question's own scale. */
  average: number | null;
  max: number | null;
};

export type InterviewInsights = {
  filters: { schoolYear: string; campus: string; event: string };
  enrolments: Metric;
  interviews: Metric;
  finalised: Metric;
  coverage: Metric<number | null>;
  byStatus: Metric<AnswerCount[]>;
  recommendation: Metric<AnswerCount[]>;
  questions: Metric<QuestionInsight[]>;
};

export async function getInterviewInsights(
  scope: Scope = {},
): Promise<InterviewInsights> {
  const enrolmentWhere = await participationWhere(scope);

  const [enrolments, rows] = await Promise.all([
    prisma.participation.count({ where: enrolmentWhere }),
    prisma.interview.findMany({
      where: { participation: enrolmentWhere },
      select: ANSWER_SELECT,
    }),
  ]);

  const finalised = rows.filter((r) => r.status === 'done').length;
  const inProgress = rows.length - finalised;

  return {
    filters: scopeLabels(scope),
    enrolments: metric(
      enrolments,
      "Inscriptions du périmètre susceptibles de donner lieu à un entretien d'orientation. Sert de dénominateur au taux de couverture.",
    ),
    interviews: metric(
      rows.length,
      "Entretiens d'orientation ouverts sur le périmètre, finalisés ou encore en cours.",
    ),
    finalised: metric(
      finalised,
      'Entretiens clôturés par la personne qui les a menés. Un entretien clôturé ne peut plus être modifié.',
    ),
    coverage: metric(
      share(rows.length, enrolments),
      "Part des inscriptions du périmètre ayant donné lieu à un entretien, en pourcentage. Plus elle est basse, moins les réponses ci-dessous représentent l'ensemble de la cohorte.",
    ),
    byStatus: metric(
      [
        {
          value: 'done',
          label: INTERVIEW_STATUS_LABELS.done,
          count: finalised,
          share: share(finalised, rows.length),
        },
        {
          value: 'in_progress',
          label: INTERVIEW_STATUS_LABELS.in_progress,
          count: inProgress,
          share: share(inProgress, rows.length),
        },
        {
          value: 'todo',
          label: INTERVIEW_STATUS_LABELS.todo,
          count: Math.max(enrolments - rows.length, 0),
          share: share(Math.max(enrolments - rows.length, 0), enrolments),
        },
      ],
      "État d'avancement des entretiens sur le périmètre. « À faire » compte les inscriptions sans entretien ouvert ; sa part est calculée sur les inscriptions, celle des deux autres sur les entretiens ouverts.",
    ),
    recommendation: metric(
      countSingle(
        rows,
        'recommendation',
        INTERVIEW_RECOMMENDATION_DISPLAY_ORDER.map((value) => ({
          value,
          label: INTERVIEW_RECOMMENDATIONS[value].label,
        })),
      ).options,
      `« ${VERDICT_SECTION.title} » : l'avis que l'équipe a porté après l'entretien, du profil le plus au moins compatible. C'est un jugement d'équipe, pas une réponse de l'élève, et il n'est jamais montré au talent. Les pourcentages portent sur les entretiens où l'avis a été renseigné.`,
    ),
    questions: metric(
      INTERVIEW_SECTIONS.flatMap((section) =>
        section.questions.flatMap((question) =>
          insightFor(rows, section.title, question),
        ),
      ),
      "Réponses des élèves, question par question, dans l'ordre du questionnaire. « answered » est le nombre d'entretiens où la question a reçu une réponse, et les pourcentages portent sur ce nombre, pas sur la cohorte. Pour une question à choix multiples, un élève peut apparaître dans plusieurs options, donc la somme dépasse 100 %.",
    ),
  };
}

/** One question's distribution, or nothing for the free-text ones. */
function insightFor(
  rows: AnswerRow[],
  section: string,
  question: InterviewQuestion,
): QuestionInsight[] {
  const base = { field: question.field, section, question: question.label };

  if (question.kind === 'rating') {
    const given = rows
      .map((r) => r.satisfactionStars)
      .filter((v): v is number => v != null);
    const options = Array.from({ length: question.max }, (_, i) => {
      const stars = i + 1;
      const count = given.filter((v) => v === stars).length;
      return {
        value: String(stars),
        label: `${stars} étoile${stars > 1 ? 's' : ''}`,
        count,
        share: share(count, given.length),
      };
    });
    return [
      {
        ...base,
        kind: 'rating',
        answered: given.length,
        options,
        average:
          given.length > 0
            ? Math.round(
                (given.reduce((sum, v) => sum + v, 0) / given.length) * 100,
              ) / 100
            : null,
        max: question.max,
      },
    ];
  }

  // Free text is the student's or the team's own words: not an aggregate, and
  // not something this operation returns.
  if (question.kind === 'text') return [];

  const counted =
    question.kind === 'single'
      ? countSingle(rows, question.field, question.options)
      : countMulti(rows, question.field, question.options);

  return [
    {
      ...base,
      kind: question.kind,
      answered: counted.answered,
      options: counted.options,
      average: null,
      max: null,
    },
  ];
}

/** Reads a column the questionnaire names, which the select above guarantees. */
const columnOf = (row: AnswerRow, field: string): unknown =>
  (row as unknown as Record<string, unknown>)[field];

function countSingle(
  rows: AnswerRow[],
  field: string,
  options: readonly { value: string; label: string }[],
) {
  const values = rows
    .map((r) => columnOf(r, field))
    .filter((v): v is string => typeof v === 'string');
  return {
    answered: values.length,
    options: options.map(({ value, label }) => {
      const count = values.filter((v) => v === value).length;
      return { value, label, count, share: share(count, values.length) };
    }),
  };
}

function countMulti(
  rows: AnswerRow[],
  field: string,
  options: readonly { value: string; label: string }[],
) {
  // "Answered" is the number of interviews that picked at least one option, so
  // a percentage reads as "of those who answered", never inflated by the blanks.
  const picked = rows
    .map((r) => columnOf(r, field))
    .filter((v): v is string[] => Array.isArray(v) && v.length > 0);
  return {
    answered: picked.length,
    options: options.map(({ value, label }) => {
      const count = picked.filter((values) => values.includes(value)).length;
      return { value, label, count, share: share(count, picked.length) };
    }),
  };
}
