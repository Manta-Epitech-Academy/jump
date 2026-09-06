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
  CLOSING_FAVOURABLE_RECOMMENDATIONS,
  CLOSING_RECOMMENDATIONS,
  CLOSING_RECOMMENDATION_DISPLAY_ORDER,
  CLOSING_STATUS_LABELS,
  VERDICT_SECTION,
} from '$lib/domain/closing';
import { adminEventRunsClosings } from '$lib/server/services/events';
import { metric, share, type Metric } from '$lib/server/adminApi/metrics';
import type { Scope } from '$lib/server/adminApi/scope';
import {
  enrolmentKey,
  scopedEnrolments,
  scopedEvents,
  scopeLabels,
} from './cohort';

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

/**
 * What the coverage rate counts, owned here and imported by the campus
 * comparison rather than retyped.
 *
 * The clause about which events count is the load-bearing half, and it is the
 * one this figure did not have. The denominator was every visible enrolment in
 * scope, so the 270 events that run no closing at all sat in it: the national
 * rate read 18 % where the honest figure is 78 %, and a director was told his
 * teams were not conducting closings when what he actually had was a
 * configuration gap. The definition already claimed the narrow reading
 * (« susceptibles de donner lieu à un closing »), which is what made the
 * figure quotable and wrong at the same time.
 */
export const CLOSING_COVERAGE_RULE =
  "Part des inscriptions susceptibles de donner lieu à un closing qui en ont effectivement donné un, en pourcentage. Ne comptent que les événements qui mènent réellement des closings, c'est-à-dire dont la section Closings est activée ET qui nomment une grille : un événement sans grille ne fait baisser aucun taux, il relève de la configuration et se lit sur « eventsRunningClosings ».";

/**
 * What the favourable-verdict share counts, owned here and imported by the campus
 * comparison.
 *
 * The names of the two levels are interpolated rather than typed out, so the
 * sentence follows `CLOSING_FAVOURABLE_RECOMMENDATIONS` if the scale ever gains a
 * level instead of quietly describing the old one.
 */
export const FAVOURABLE_VERDICT_RULE = `Part des closings dont l'avis d'équipe est favorable, en pourcentage. Sont favorables les deux avis les plus compatibles, « ${CLOSING_FAVOURABLE_RECOMMENDATIONS.map(
  (r) => CLOSING_RECOMMENDATIONS[r].label,
).join(
  ' » et « ',
)} ». Calculée sur les seuls closings où l'avis a été renseigné, comme les parts de la répartition détaillée.`;

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
  events: Metric;
  eventsRunningClosings: Metric;
  eventsRunningClosingsShare: Metric<number | null>;
  enrolments: Metric;
  enrolmentsConcerned: Metric;
  closings: Metric;
  finalised: Metric;
  coverage: Metric<number | null>;
  byStatus: Metric<AnswerCount[]>;
  recommendation: Metric<AnswerCount[]>;
  favourableVerdictShare: Metric<number | null>;
  questions: Metric<QuestionInsight[]>;
};

export async function getClosingInsights(
  scope: Scope = {},
): Promise<ClosingInsights> {
  const [{ events }, enrolmentPairs] = await Promise.all([
    scopedEvents(scope),
    scopedEnrolments(scope),
  ]);

  // The events that actually conduct closings, read off the same rule the dev
  // sidebar uses to decide whether to offer the page at all.
  const concernedIds = new Set(
    events.filter(adminEventRunsClosings).map((e) => e.id),
  );

  const enrolments = enrolmentPairs.length;
  const enrolmentsConcerned = enrolmentPairs.filter((p) =>
    concernedIds.has(p.eventId),
  ).length;
  // The cohort as a set of pairs. A closing keys on (talent, event) now, so this
  // is where the visibility clause lands: without it a talent who withdrew after
  // their closing would count in the numerator and not in the denominator.
  const enrolled = new Set(enrolmentPairs.map(enrolmentKey));

  const rows = (
    await prisma.closing_Record.findMany({
      where: {
        eventId: { in: [...new Set(enrolmentPairs.map((p) => p.eventId))] },
      },
      select: {
        talentId: true,
        eventId: true,
        status: true,
        recommendation: true,
        templateId: true,
        answers: { select: ANSWER_SELECT },
      },
    })
  ).filter((r) => enrolled.has(enrolmentKey(r)));

  const finalised = rows.filter((r) => r.status === 'done').length;
  const inProgress = rows.length - finalised;
  // Numerator of the coverage rate: closings on the events the denominator is
  // taken over. Kept separate from `rows.length` rather than assumed equal,
  // because an event whose grid was removed afterwards keeps its closings and
  // would otherwise push the rate past 100 %.
  const closingsConcerned = rows.filter((r) =>
    concernedIds.has(r.eventId),
  ).length;
  const todo = Math.max(enrolmentsConcerned - closingsConcerned, 0);

  const questions = await questionInsights(rows);

  return {
    filters: scopeLabels(scope),
    events: metric(
      events.length,
      'Événements du périmètre, quelle que soit leur configuration.',
    ),
    eventsRunningClosings: metric(
      concernedIds.size,
      "Événements du périmètre qui mènent réellement des closings : leur section Closings est activée ET ils nomment une grille. Plus strict que le décompte par section de stats_events_overview, où un événement dont la grille n'est pas choisie compte quand même.",
    ),
    eventsRunningClosingsShare: metric(
      share(concernedIds.size, events.length),
      "Part des événements du périmètre qui mènent des closings, en pourcentage. Ce qui manque à 100 % est un défaut de configuration et non de conduite : les inscriptions de ces événements n'entrent pas dans le taux de couverture.",
    ),
    enrolments: metric(
      enrolments,
      "Inscriptions visibles du périmètre, tous événements confondus. Ce n'est PAS le dénominateur du taux de couverture : la plupart portent sur des événements qui ne mènent aucun closing.",
    ),
    enrolmentsConcerned: metric(
      enrolmentsConcerned,
      'Inscriptions du périmètre portant sur un événement qui mène des closings. Dénominateur du taux de couverture.',
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
      share(closingsConcerned, enrolmentsConcerned),
      `${CLOSING_COVERAGE_RULE} Numérateur et dénominateur portent ici sur les mêmes événements, donc une grille retirée après coup ne peut pas faire dépasser 100 %. Plus ce taux est bas, moins les réponses ci-dessous représentent la cohorte de ces événements.`,
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
          count: todo,
          share: share(todo, enrolmentsConcerned),
        },
      ],
      "État d'avancement des closings sur le périmètre. « À faire » compte les inscriptions sans closing ouvert sur les seuls événements qui mènent des closings, la même base que le taux de couverture ; sa part est calculée sur ces inscriptions, celle des deux autres sur les closings ouverts.",
    ),
    recommendation: metric(
      countRecommendations(rows),
      `« ${VERDICT_SECTION.title} » : l'avis que l'équipe a porté après le closing, du profil le plus au moins compatible. C'est un jugement d'équipe, pas une réponse de l'élève, et il n'est jamais montré au talent. Les pourcentages portent sur les closings où l'avis a été renseigné.`,
    ),
    favourableVerdictShare: metric(
      favourableVerdictShare(rows),
      FAVOURABLE_VERDICT_RULE,
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

/**
 * The two most compatible verdicts as one share.
 *
 * Beside {@link countRecommendations} rather than derived from its output: both
 * read the same rows and the same base (verdicts actually given), so a reader
 * comparing the detailed split with this figure cannot find them disagreeing.
 */
function favourableVerdictShare(rows: RecordRow[]): number | null {
  const given = rows.filter((r) => r.recommendation != null);
  const favourable = given.filter((r) =>
    (CLOSING_FAVOURABLE_RECOMMENDATIONS as readonly string[]).includes(
      r.recommendation as string,
    ),
  );
  return share(favourable.length, given.length);
}

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
