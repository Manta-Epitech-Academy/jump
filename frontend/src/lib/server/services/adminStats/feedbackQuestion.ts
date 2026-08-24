/**
 * One question of one feedback form, and how the answer differs between campuses.
 *
 * The question this exists for was asked out loud and could not be answered: a
 * form is filled in on a dozen campuses, one of its questions is about the morning
 * conferences, and the director wanted that question's figures nationally and then
 * the cities that received it best. `stats_feedback_results` holds the national
 * distribution, but a campus is a *filter* there, so comparing fifteen of them
 * meant fifteen calls and a ranking done downstream - the one thing this tier
 * exists to prevent.
 *
 * A favourable share only exists where the answers are ordered, which is `scale`
 * and nothing else. A `single` question's options are a set: the recommendation
 * question happens to read best-to-worst, and "Ça t'a aidé à y voir plus clair ?"
 * does not (its options are "Pas encore, ça mûrit", "Oui, carrément", "Non, pas
 * vraiment"), and no property of the data tells them apart. So the share is null
 * outside a scale and the definition says why, because a ranking that is silently
 * wrong is worse than a ranking that is absent.
 *
 * One query for the whole comparison. Both dashboards' aggregation
 * (`computeFormStats`) answers per form, so grouping through it would mean one full
 * pass per campus; the answers to a single question are few enough to read once and
 * bucket in memory, which is what `attendanceRate` does with participations.
 */

import { prisma } from '$lib/server/db';
import { eventDisplayName } from '$lib/domain/event';
import { optionPolarity } from '$lib/domain/feedback';
import { getFormGraphById } from '$lib/server/feedbackForms';
import {
  buildSubmissionWhere,
  type StatsScope,
} from '$lib/server/feedbackStats';
import {
  metric,
  rank,
  rankAxisNote,
  RANK_UNITS,
  share,
  type Metric,
  type Ranked,
} from '$lib/server/adminApi/metrics';
import { UnknownScopeError, type Scope } from '$lib/server/adminApi/scope';
import { scopedEvents, scopeLabels } from './cohort';

/** Groups detailed before the answer stops listing them. */
export const FEEDBACK_QUESTION_GROUPS_LIMIT = 40;

/**
 * Where an answer with no campus or no event lands.
 *
 * Public responses carry a self-reported campus label and no event at all, so a
 * grouping has a bucket for the ones that named neither. It is never ranked: an
 * unmeasurable group given a position reads as the worst one.
 */
const NOT_SET = '(non renseigné)';

export type QuestionOption = {
  /** Authored position among this question's options, 0-based. */
  position: number;
  label: string;
  /** `choice` is a level of the scale; `extra` is a legitimate answer beside it. */
  kind: string;
  count: number;
  share: number | null;
};

export type QuestionGroup = {
  group: string;
  answered: number;
  options: QuestionOption[];
  favourableShare: number | null;
};

export type FeedbackQuestion = {
  filters: {
    schoolYear: string;
    campus: string;
    event: string;
    form: string;
    question: string;
  };
  question: Metric<{
    key: string;
    prompt: string;
    type: string;
    /** Whether the options carry an order, and so whether "best" means anything. */
    ordered: boolean;
  }>;
  submissions: Metric;
  answered: Metric;
  answeredShare: Metric<number | null>;
  options: Metric<QuestionOption[]>;
  favourableShare: Metric<number | null>;
  groups: Metric<Ranked<QuestionGroup>[]> | null;
  truncated: boolean;
};

/** How an answer is attributed to a group, per axis. */
type GroupBy = 'campus' | 'event';

type AnswerRow = {
  selectedOptions: { optionId: string }[];
  submission: {
    respondentCampusLabel: string | null;
    event: {
      titre: string;
      publicName: string | null;
      campus: { name: string };
    } | null;
  };
};

const FAVOURABLE_RULE =
  "Part des réponses à cette question qui portent sur une option favorable, en pourcentage. Une question de type « scale » est rédigée de la meilleure à la pire réponse : les options du tiers supérieur de cette échelle sont les options favorables. Vaut null pour tout autre type de question, y compris un choix unique : ses options ne portent aucun ordre déclaré, donc aucune option ne peut être dite favorable sans l'inventer.";

export async function getFeedbackQuestion(
  scope: Scope = {},
  params: { formId: string; question: string; groupBy?: GroupBy },
): Promise<FeedbackQuestion> {
  const form = await getFormGraphById(params.formId);
  if (!form) {
    throw new UnknownScopeError(
      `Formulaire « ${params.formId} » introuvable. Les identifiants de questionnaire sont renvoyés par les opérations config_feedback_forms et stats_feedback_results.`,
    );
  }

  // Identity questions never become answers, so they are not askable about.
  const askable = form.questions.filter((q) => q.identityField == null);
  const question = askable.find((q) => q.key === params.question);
  if (!question) {
    throw new UnknownScopeError(
      `Question « ${params.question} » absente du questionnaire « ${form.title} ». Clés disponibles : ${askable.map((q) => q.key).join(', ')}.`,
    );
  }

  const axis = await eventAxis(scope);
  const submissionWhere = buildSubmissionWhere(params.formId, {
    ...axis,
    campusName: scope.campus?.name,
  });

  const [answers, submissions] = await Promise.all([
    prisma.feedback_Answer.findMany({
      where: { questionId: question.id, submission: submissionWhere },
      select: {
        selectedOptions: { select: { optionId: true } },
        submission: {
          select: {
            respondentCampusLabel: true,
            event: {
              select: {
                titre: true,
                publicName: true,
                campus: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.feedback_Submission.count({ where: submissionWhere }),
  ]);

  // `choice` options, in authored order, are the scale. An `extra` sits beside it
  // and has no position on it, so it is excluded before the index is read.
  const levels = question.options.filter((o) => o.kind === 'choice');
  const ordered = question.type === 'scale';
  const favourableIds = new Set(
    ordered
      ? levels
          .filter(
            (_, index) => optionPolarity(index, levels.length) === 'positive',
          )
          .map((o) => o.id)
      : [],
  );

  const tally = (rows: AnswerRow[]): Omit<QuestionGroup, 'group'> => {
    const counts = new Map<string, number>();
    let favourable = 0;
    for (const row of rows) {
      for (const { optionId } of row.selectedOptions) {
        counts.set(optionId, (counts.get(optionId) ?? 0) + 1);
        if (favourableIds.has(optionId)) favourable += 1;
      }
    }
    return {
      answered: rows.length,
      options: question.options.map((option, position) => ({
        position,
        label: option.label,
        kind: option.kind,
        count: counts.get(option.id) ?? 0,
        share: share(counts.get(option.id) ?? 0, rows.length),
      })),
      favourableShare: ordered ? share(favourable, rows.length) : null,
    };
  };

  const whole = tally(answers);
  const groups = params.groupBy ? groupRows(answers, params.groupBy) : null;

  return {
    filters: {
      ...scopeLabels(scope),
      form: form.title,
      question: question.key,
    },
    question: metric(
      {
        key: question.key,
        prompt: question.prompt,
        type: question.type,
        ordered,
      },
      "La question interrogée. « key » est son identifiant stable dans le questionnaire, « prompt » son libellé tel que l'élève le lit. « ordered » vaut vrai quand ses options forment une échelle rédigée de la meilleure à la pire réponse, ce qui est le cas des questions de type « scale » : c'est la seule situation où parler de meilleure réponse a un sens.",
    ),
    submissions: metric(
      submissions,
      'Réponses au questionnaire sur le périmètre, toutes questions confondues. Sert de base à « answeredShare ».',
    ),
    answered: metric(
      whole.answered,
      'Personnes ayant répondu à cette question sur le périmètre. Les parts des options portent sur ce nombre. Une question à choix multiples compte une personne une fois ici même si elle a coché plusieurs options, donc la somme des parts peut dépasser 100 %.',
    ),
    answeredShare: metric(
      share(whole.answered, submissions),
      "Part des réponses au questionnaire qui ont répondu à cette question, en pourcentage. Inférieure à 100 % quand la question n'est pas obligatoire ou quand elle a été ajoutée après les premières réponses.",
    ),
    options: metric(
      whole.options,
      "Chaque option de la question, dans l'ordre du questionnaire, avec le nombre de réponses et sa part. « position » est le rang dans cet ordre : pour une échelle, 0 est la meilleure réponse. « kind » vaut choice pour un niveau de l'échelle et extra pour une option légitime posée à côté d'elle, qui ne compte pas comme un niveau.",
    ),
    favourableShare: metric(whole.favourableShare, FAVOURABLE_RULE),
    groups: groups
      ? metric(
          groups.slice(0, FEEDBACK_QUESTION_GROUPS_LIMIT),
          `${FAVOURABLE_RULE} Ici ${params.groupBy === 'campus' ? 'par campus' : 'par événement'}, classé par cette part. ${rankAxisNote(
            params.groupBy === 'campus' ? RANK_UNITS.campus : RANK_UNITS.event,
          )} Le groupe « ${NOT_SET} » rassemble les réponses envoyées par le lien public sans campus ni événement renseigné, et n'est jamais classé. Limité à ${FEEDBACK_QUESTION_GROUPS_LIMIT} lignes.`,
        )
      : null,
    truncated: (groups?.length ?? 0) > FEEDBACK_QUESTION_GROUPS_LIMIT,
  };

  function groupRows(rows: AnswerRow[], by: GroupBy) {
    const buckets = new Map<string, AnswerRow[]>();
    for (const row of rows) {
      const key =
        by === 'campus'
          ? (row.submission.event?.campus.name ??
            row.submission.respondentCampusLabel ??
            NOT_SET)
          : row.submission.event
            ? eventDisplayName(row.submission.event)
            : NOT_SET;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(row);
      else buckets.set(key, [row]);
    }

    return rank(
      [...buckets.entries()].map(([group, groupRows]) => ({
        group,
        ...tally(groupRows),
      })),
      (row) => row.group,
      // Never ranked on a share it does not have: an unordered question, or a
      // group that is only a leftover bucket.
      (row) => (row.group === NOT_SET ? null : row.favourableShare),
    );
  }
}

/**
 * Which events the périmètre selects, in the shape `buildSubmissionWhere` reads.
 *
 * The same rule as `feedbackResults`: one event stays one event, a school year
 * becomes its set of events, and a campus alone keeps going through the campus
 * name, because that is the only filter that also catches a public response,
 * matched on the campus the respondent picked themselves.
 */
async function eventAxis(
  scope: Scope,
): Promise<Pick<StatsScope, 'eventId' | 'eventIds'>> {
  if (scope.event) return { eventId: scope.event.id };
  if (scope.schoolYear) {
    const { events } = await scopedEvents(scope);
    return { eventIds: events.map((event) => event.id) };
  }
  return {};
}
