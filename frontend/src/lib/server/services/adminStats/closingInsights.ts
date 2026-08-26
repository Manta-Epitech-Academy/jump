/**
 * What the closings say about a cohort.
 *
 * The single richest source the platform holds on why students come to us: how
 * they heard about us, what motivates them, which specialities they are heading
 * for, which tech domains they picture themselves in, how satisfied they left,
 * and whether they want to come back. All of it already collected, and readable
 * one student at a time until this existed.
 *
 * Aggregated by BANK QUESTION, across grids. That is the whole point of the
 * question bank: the orientation question asked at a stage and at a Coding Club
 * is one row, so one distribution legitimately spans both. Where a question is
 * carried by only some of the grids in scope, its `asked` count says so, because
 * a percentage read against the wrong base is worse than no percentage.
 *
 * Aggregates only, and structured answers only. Every free-text field on a
 * closing (the per-question notes, the team's verdict note) is the staff's
 * written impression of a named minor and is never selected here. The one
 * exception, the student's own sentence about the event, is deliberately
 * collected for communication and has its own operation.
 */

import { prisma } from '$lib/server/db';
import {
  CLOSING_RECOMMENDATIONS,
  CLOSING_RECOMMENDATION_DISPLAY_ORDER,
  CLOSING_STATUS_LABELS,
  VERDICT_SECTION,
} from '$lib/domain/closing';
import { metric, share, type Metric } from '$lib/server/adminApi/metrics';
import type { Scope } from '$lib/server/adminApi/scope';
import { participationWhere, scopeLabels } from './cohort';

/**
 * Structured answers only: the options picked and the rating given. `freeText`
 * and `note` are deliberately absent, and that absence is the tier's no-PII rule
 * expressed as a select rather than as a promise.
 */
const ANSWER_SELECT = {
  ratingValue: true,
  questionId: true,
  selectedOptions: { select: { optionId: true } },
} as const;

export type AnswerCount = {
  value: string;
  label: string;
  count: number;
  /** Percentage of the closings that answered this question. */
  share: number | null;
};

export type QuestionInsight = {
  /** The bank question's stable key, so an answer can be traced to its question. */
  key: string;
  /** The canonical wording, which is the name this figure is quoted under. A grid
   *  may read it aloud differently; the figure keeps one name. */
  question: string;
  /** `single` = one answer each, `multi` = several allowed, `rating` = stars. */
  kind: 'single' | 'multi' | 'rating';
  /** Closings in scope whose grid actually asks this question. The base every
   *  reading of `answered` has to be taken against. */
  asked: number;
  answered: number;
  options: AnswerCount[];
  /** Ratings only: mean of the stars given, on the question's own scale. */
  average: number | null;
  max: number | null;
  /** The grids in scope that ask it, so a partial question is legible as one. */
  templates: string[];
};

export type ClosingInsights = {
  filters: { schoolYear: string; campus: string; event: string };
  enrolments: Metric;
  closings: Metric;
  finalised: Metric;
  coverage: Metric<number | null>;
  byStatus: Metric<AnswerCount[]>;
  recommendation: Metric<AnswerCount[]>;
  questions: Metric<QuestionInsight[]>;
};

export async function getClosingInsights(
  scope: Scope = {},
): Promise<ClosingInsights> {
  const enrolmentWhere = await participationWhere(scope);

  const [enrolments, rows] = await Promise.all([
    prisma.participation.count({ where: enrolmentWhere }),
    prisma.closing_Record.findMany({
      where: { participation: enrolmentWhere },
      select: {
        status: true,
        recommendation: true,
        templateId: true,
        answers: { select: ANSWER_SELECT },
      },
    }),
  ]);

  const finalised = rows.filter((r) => r.status === 'done').length;
  const inProgress = rows.length - finalised;

  const questions = await questionInsights(rows);

  return {
    filters: scopeLabels(scope),
    enrolments: metric(
      enrolments,
      'Inscriptions du périmètre susceptibles de donner lieu à un closing. Sert de dénominateur au taux de couverture.',
    ),
    closings: metric(
      rows.length,
      'Closings ouverts sur le périmètre, finalisés ou encore en cours.',
    ),
    finalised: metric(
      finalised,
      'Closings clôturés par la personne qui les a menés. Un closing clôturé ne peut plus être modifié.',
    ),
    coverage: metric(
      share(rows.length, enrolments),
      "Part des inscriptions du périmètre ayant donné lieu à un closing, en pourcentage. Plus elle est basse, moins les réponses ci-dessous représentent l'ensemble de la cohorte.",
    ),
    byStatus: metric(
      [
        {
          value: 'done',
          label: CLOSING_STATUS_LABELS.done,
          count: finalised,
          share: share(finalised, rows.length),
        },
        {
          value: 'in_progress',
          label: CLOSING_STATUS_LABELS.in_progress,
          count: inProgress,
          share: share(inProgress, rows.length),
        },
        {
          value: 'todo',
          label: CLOSING_STATUS_LABELS.todo,
          count: Math.max(enrolments - rows.length, 0),
          share: share(Math.max(enrolments - rows.length, 0), enrolments),
        },
      ],
      "État d'avancement des closings sur le périmètre. « À faire » compte les inscriptions sans closing ouvert ; sa part est calculée sur les inscriptions, celle des deux autres sur les closings ouverts.",
    ),
    recommendation: metric(
      countRecommendations(rows),
      `« ${VERDICT_SECTION.title} » : l'avis que l'équipe a porté après le closing, du profil le plus au moins compatible. C'est un jugement d'équipe, pas une réponse de l'élève, et il n'est jamais montré au talent. Les pourcentages portent sur les closings où l'avis a été renseigné.`,
    ),
    questions: metric(
      questions,
      "Réponses des élèves, question par question. Le périmètre peut mélanger plusieurs grilles de closing : une question posée par plusieurs d'entre elles est agrégée une seule fois, et « asked » dit sur combien de closings elle a réellement été posée. Les pourcentages portent sur « answered », le nombre de closings où elle a reçu une réponse, pas sur la cohorte. Pour une question à choix multiples, un élève peut apparaître dans plusieurs options, donc la somme dépasse 100 %.",
    ),
  };
}

type RecordRow = {
  status: string;
  recommendation: string | null;
  templateId: string;
  answers: {
    ratingValue: number | null;
    questionId: string;
    selectedOptions: { optionId: string }[];
  }[];
};

function countRecommendations(rows: RecordRow[]): AnswerCount[] {
  const given = rows
    .map((r) => r.recommendation)
    .filter((v): v is string => v != null);
  return CLOSING_RECOMMENDATION_DISPLAY_ORDER.map((value) => {
    const count = given.filter((v) => v === value).length;
    return {
      value,
      label: CLOSING_RECOMMENDATIONS[value].label,
      count,
      share: share(count, given.length),
    };
  });
}

/**
 * One distribution per bank question asked anywhere in scope.
 *
 * `asked` comes from the grids, not from the answers: a question nobody answered
 * still has a denominator, and without it a question carried by one grid of three
 * would read as though the whole cohort had declined to answer it.
 */
async function questionInsights(rows: RecordRow[]): Promise<QuestionInsight[]> {
  if (rows.length === 0) return [];

  const templateIds = [...new Set(rows.map((r) => r.templateId))];
  const templates = await prisma.closing_Template.findMany({
    where: { id: { in: templateIds } },
    select: {
      id: true,
      label: true,
      questions: {
        select: {
          position: true,
          question: {
            select: {
              id: true,
              key: true,
              label: true,
              kind: true,
              max: true,
              options: {
                select: { id: true, value: true, label: true, position: true },
                orderBy: { position: 'asc' },
              },
            },
          },
        },
        orderBy: { position: 'asc' },
      },
    },
  });

  const recordsPerTemplate = new Map<string, number>();
  for (const r of rows) {
    recordsPerTemplate.set(
      r.templateId,
      (recordsPerTemplate.get(r.templateId) ?? 0) + 1,
    );
  }

  type Acc = {
    question: (typeof templates)[number]['questions'][number]['question'];
    asked: number;
    templates: Set<string>;
    firstSeen: number;
  };
  const byQuestion = new Map<string, Acc>();
  let order = 0;
  for (const t of templates) {
    for (const tq of t.questions) {
      const q = tq.question;
      const acc = byQuestion.get(q.id);
      if (acc) {
        acc.asked += recordsPerTemplate.get(t.id) ?? 0;
        acc.templates.add(t.label);
      } else {
        byQuestion.set(q.id, {
          question: q,
          asked: recordsPerTemplate.get(t.id) ?? 0,
          templates: new Set([t.label]),
          firstSeen: order++,
        });
      }
    }
  }

  const ratingsByQuestion = new Map<string, number[]>();
  const picksByOption = new Map<string, number>();
  const answeredByQuestion = new Map<string, number>();
  for (const r of rows) {
    for (const a of r.answers) {
      const answered = a.selectedOptions.length > 0 || a.ratingValue != null;
      if (!answered) continue;
      answeredByQuestion.set(
        a.questionId,
        (answeredByQuestion.get(a.questionId) ?? 0) + 1,
      );
      if (a.ratingValue != null) {
        const list = ratingsByQuestion.get(a.questionId) ?? [];
        list.push(a.ratingValue);
        ratingsByQuestion.set(a.questionId, list);
      }
      for (const s of a.selectedOptions) {
        picksByOption.set(s.optionId, (picksByOption.get(s.optionId) ?? 0) + 1);
      }
    }
  }

  return [...byQuestion.values()]
    .filter((acc) => acc.question.kind !== 'text')
    .sort((a, b) => a.firstSeen - b.firstSeen)
    .map((acc): QuestionInsight => {
      const q = acc.question;
      const answered = answeredByQuestion.get(q.id) ?? 0;
      const base = {
        key: q.key,
        question: q.label,
        asked: acc.asked,
        answered,
        templates: [...acc.templates],
      };

      if (q.kind === 'rating') {
        const given = ratingsByQuestion.get(q.id) ?? [];
        const max = q.max ?? 0;
        return {
          ...base,
          kind: 'rating',
          options: Array.from({ length: max }, (_, i) => {
            const stars = i + 1;
            const count = given.filter((v) => v === stars).length;
            return {
              value: String(stars),
              label: `${stars} étoile${stars > 1 ? 's' : ''}`,
              count,
              share: share(count, given.length),
            };
          }),
          average:
            given.length > 0
              ? Math.round(
                  (given.reduce((sum, v) => sum + v, 0) / given.length) * 100,
                ) / 100
              : null,
          max: q.max,
        };
      }

      return {
        ...base,
        kind: q.kind === 'multi' ? 'multi' : 'single',
        options: q.options.map((o) => {
          const count = picksByOption.get(o.id) ?? 0;
          return {
            value: o.value,
            label: o.label,
            count,
            share: share(count, answered),
          };
        }),
        average: null,
        max: null,
      };
    });
}
