/**
 * One question of the closing bank, and how the answer differs between campuses,
 * events or grids.
 *
 * `stats_closing_insights` holds the whole grid's distribution, but a campus is a
 * *filter* there, so comparing fifteen of them meant fifteen calls and a ranking
 * done downstream - the one thing this tier exists to prevent, and the same gap
 * `feedbackQuestion` was written to close on the feedback side. It happened for
 * real: asked whether the team's verdict differed between campuses, the model
 * called the insights fifteen times and built the table itself.
 *
 * The `grid` axis is the one that has no equivalent on the feedback side, and it
 * is why the question bank is global in the first place. "Comment as-tu connu cet
 * événement" asked at a stage and at a Coding Club is ONE row, so the two formats
 * fall into one distribution - and the only thing missing was the operation that
 * splits that distribution back apart when somebody wants to compare them. Doing
 * it by hand meant one call per event and a fold nobody could check.
 *
 * No leftover bucket here, unlike the feedback answer. A closing hangs off a
 * participation, which hangs off an event, which belongs to a campus, and the
 * record pins the grid it was conducted with: every row can name its group on all
 * three axes, so there is nothing to put in a « non renseigné » line.
 *
 * What is ranked depends on what the question declares, and never on a guess:
 * a rating ranks on its average, a question whose options carry a valence ranks
 * on the favourable share, and a question whose options are a plain set comes
 * back unranked. A ranking that is silently wrong is worse than one that is
 * absent.
 */

import { prisma } from '$lib/server/db';
import { eventDisplayName } from '$lib/domain/event';
import type { AnswerPolarity } from '$lib/domain/polarity';
import { handleProvenanceFr } from '$lib/server/adminApi/handles';
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
import { participationWhere, scopeLabels } from './cohort';

/** Groups detailed before the answer stops listing them. */
export const CLOSING_QUESTION_GROUPS_LIMIT = 40;

/** How an answer is attributed to a group, per axis. */
export type ClosingQuestionGroupBy = 'campus' | 'event' | 'grid';

export type ClosingQuestionOption = {
  /** Authored position among this question's options, 0-based. */
  position: number;
  /** The stored value, which is what analytics elsewhere quote. */
  value: string;
  label: string;
  /** Declared valence, or null on options that form a set rather than a scale. */
  tone: AnswerPolarity | null;
  count: number;
  share: number | null;
};

export type ClosingQuestionGroup = {
  /** What this row is: a campus, an event as teams see it, or a grid. */
  group: string;
  /**
   * Which event this row is, when grouping by event. Null on the other axes.
   *
   * Returned because the name does not identify one: fifteen events currently
   * share the name "Stage de Seconde", and a comparison whose rows cannot be told
   * apart is not a comparison. It is also what lets the winner be passed back to
   * the operations that take an event.
   */
  eventId: string | null;
  asked: number;
  answered: number;
  options: ClosingQuestionOption[];
  average: number | null;
  favourableShare: number | null;
};

export type ClosingQuestion = {
  filters: {
    schoolYear: string;
    campus: string;
    event: string;
    question: string;
  };
  question: Metric<{
    key: string;
    label: string;
    kind: string;
    max: number | null;
    /** Whether the answers carry an order, and so whether "best" means anything. */
    ordered: boolean;
    /** The grids that ask it, so a partial question is legible as one. */
    grids: string[];
  }>;
  closings: Metric;
  asked: Metric;
  answered: Metric;
  answeredShare: Metric<number | null>;
  options: Metric<ClosingQuestionOption[]>;
  average: Metric<number | null>;
  favourableShare: Metric<number | null>;
  groups: Metric<Ranked<ClosingQuestionGroup>[]> | null;
  truncated: boolean;
};

const FAVOURABLE_RULE =
  "Part des réponses portant sur une option favorable, en pourcentage. Une option est favorable quand la grille l'a déclarée telle : les questions à échelle (oui / un peu / pas du tout) portent cette valence sur chacune de leurs options. Vaut null pour une question dont les options forment un ensemble sans ordre, comme un canal de découverte, où aucune réponse ne peut être dite meilleure sans l'inventer, et null également pour une question notée, dont la moyenne dit la même chose sur sa propre échelle.";

type AnswerRow = {
  ratingValue: number | null;
  selectedOptions: { optionId: string }[];
};

type RecordRow = {
  templateId: string;
  participation: {
    event: {
      id: string;
      titre: string;
      publicName: string | null;
      campus: { name: string };
    };
  };
  answers: AnswerRow[];
};

export async function getClosingQuestion(
  scope: Scope = {},
  params: { questionKey: string; groupBy?: ClosingQuestionGroupBy },
): Promise<ClosingQuestion> {
  const question = await prisma.closing_Question.findUnique({
    where: { key: params.questionKey },
    select: {
      id: true,
      key: true,
      label: true,
      kind: true,
      max: true,
      options: {
        select: { id: true, value: true, label: true, tone: true },
        orderBy: { position: 'asc' },
      },
    },
  });
  if (!question) {
    throw new UnknownScopeError(
      `Question de closing « ${params.questionKey} » introuvable dans la banque. ${handleProvenanceFr('closingQuestionKey')}`,
    );
  }
  // A distribution over free text is not a figure. Refused rather than answered
  // with an empty options list, which would read as "nobody answered".
  if (question.kind === 'text') {
    throw new UnknownScopeError(
      `La question « ${question.key} » attend une réponse rédigée : elle n'a pas de répartition. Les phrases des élèves qui sont destinées à être citées se lisent avec stats_closing_testimonials.`,
    );
  }

  const enrolmentWhere = await participationWhere(scope);
  const [askedBy, rows] = await Promise.all([
    prisma.closing_TemplateQuestion.findMany({
      where: { questionId: question.id },
      select: { template: { select: { id: true, label: true } } },
    }),
    prisma.closing_Record.findMany({
      where: { participation: enrolmentWhere },
      // The buckets below are filled in this order, and `rank` breaks a tie on
      // the group name. Without an order here two identical calls could hand the
      // same two rows back the other way round, and a ranking that reshuffles
      // reads as a change.
      orderBy: { id: 'asc' },
      select: {
        templateId: true,
        participation: {
          select: {
            event: {
              select: {
                id: true,
                titre: true,
                publicName: true,
                campus: { select: { name: true } },
              },
            },
          },
        },
        answers: {
          where: { questionId: question.id },
          select: {
            ratingValue: true,
            selectedOptions: { select: { optionId: true } },
          },
        },
      },
    }),
  ]);

  const gridOf = new Map(askedBy.map((r) => [r.template.id, r.template.label]));
  // `asked` comes from the grids, not from the answers: a closing conducted with
  // a grid that does not carry this question was never given the chance to answer
  // it, and counting it would read as a cohort that declined.
  const concerned = rows.filter((r) => gridOf.has(r.templateId));

  const favourableIds = new Set(
    question.options.filter((o) => o.tone === 'positive').map((o) => o.id),
  );
  const isRating = question.kind === 'rating';
  const ordered = isRating || question.options.some((o) => o.tone != null);

  const tally = (
    group: RecordRow[],
  ): Omit<ClosingQuestionGroup, 'group' | 'eventId'> => {
    const counts = new Map<string, number>();
    const ratings: number[] = [];
    let answered = 0;
    let favourable = 0;

    for (const record of group) {
      for (const answer of record.answers) {
        const given =
          answer.selectedOptions.length > 0 || answer.ratingValue != null;
        if (!given) continue;
        answered += 1;
        if (answer.ratingValue != null) ratings.push(answer.ratingValue);
        for (const { optionId } of answer.selectedOptions) {
          counts.set(optionId, (counts.get(optionId) ?? 0) + 1);
          if (favourableIds.has(optionId)) favourable += 1;
        }
      }
    }

    return {
      asked: group.length,
      answered,
      options: isRating
        ? ratingLevels(question.max, ratings)
        : question.options.map((option, position) => ({
            position,
            value: option.value,
            label: option.label,
            tone: option.tone as AnswerPolarity | null,
            count: counts.get(option.id) ?? 0,
            share: share(counts.get(option.id) ?? 0, answered),
          })),
      average: mean(ratings),
      favourableShare:
        isRating || !ordered ? null : share(favourable, answered),
    };
  };

  const whole = tally(concerned);
  const groups = params.groupBy ? groupRows(concerned, params.groupBy) : null;

  return {
    filters: { ...scopeLabels(scope), question: question.key },
    question: metric(
      {
        key: question.key,
        label: question.label,
        kind: question.kind,
        max: question.max,
        ordered,
        grids: [...gridOf.values()],
      },
      "La question interrogée, telle que la banque la nomme. « label » est le libellé canonique, sous lequel chaque chiffre est cité, même quand une grille la lit à voix haute autrement. « ordered » vaut vrai quand ses réponses portent un ordre déclaré (une note, ou des options à valence) : c'est la seule situation où parler de meilleure réponse a un sens. « grids » liste les grilles qui la posent.",
    ),
    closings: metric(
      rows.length,
      'Closings ouverts sur le périmètre, toutes grilles confondues.',
    ),
    asked: metric(
      concerned.length,
      "Closings du périmètre dont la grille pose réellement cette question. C'est la base de « answeredShare », et le seul ensemble sur lequel les groupes ci-dessous sont construits : une grille qui ne pose pas la question n'apparaît pas comme un groupe muet.",
    ),
    answered: metric(
      whole.answered,
      "Closings où la question a reçu une réponse. Les parts des options portent sur ce nombre. Une question à choix multiples compte un élève une fois ici même s'il a coché plusieurs options, donc la somme des parts peut dépasser 100 %.",
    ),
    answeredShare: metric(
      share(whole.answered, concerned.length),
      "Part des closings où la question a été posée qui y ont effectivement répondu, en pourcentage. Inférieure à 100 % quand la question a été sautée pendant l'entretien, ce qui arrive d'autant plus qu'elle est longue à dérouler.",
    ),
    options: metric(
      whole.options,
      "Chaque réponse possible, dans l'ordre de la question, avec le nombre de closings concernés et sa part. « value » est la valeur stockée, jamais renommée, sous laquelle la réponse est comptée ; « tone » la valence déclarée quand la question en porte une. Pour une question notée, une ligne par niveau de l'échelle.",
    ),
    average: metric(
      whole.average,
      "Note moyenne donnée, sur l'échelle de la question, ou null hors question notée et quand personne n'a répondu.",
    ),
    favourableShare: metric(whole.favourableShare, FAVOURABLE_RULE),
    groups: groups
      ? metric(
          groups.slice(0, CLOSING_QUESTION_GROUPS_LIMIT),
          `${groupAxisDefinition(params.groupBy!, isRating, ordered)} À lire avec « asked », qui dit sur combien de closings la question a été posée dans ce groupe : un groupe à trois closings peut occuper la première place sans rien dire de comparable à un groupe à cent. ${rankAxisNote(
            RANK_UNITS[params.groupBy!],
          )} Limité à ${CLOSING_QUESTION_GROUPS_LIMIT} lignes.`,
        )
      : null,
    truncated: (groups?.length ?? 0) > CLOSING_QUESTION_GROUPS_LIMIT,
  };

  /** Buckets on what identifies a group, never on what displays it. */
  function groupRows(records: RecordRow[], by: ClosingQuestionGroupBy) {
    type Bucket = {
      group: string;
      eventId: string | null;
      records: RecordRow[];
    };
    const buckets = new Map<string, Bucket>();

    for (const record of records) {
      const event = record.participation.event;
      const identity: Omit<Bucket, 'records'> =
        by === 'campus'
          ? { group: event.campus.name, eventId: null }
          : by === 'event'
            ? { group: eventDisplayName(event), eventId: event.id }
            : {
                group: gridOf.get(record.templateId) ?? record.templateId,
                eventId: null,
              };

      const key =
        identity.eventId ??
        (by === 'grid' ? record.templateId : identity.group);
      const bucket = buckets.get(key);
      if (bucket) bucket.records.push(record);
      else buckets.set(key, { ...identity, records: [record] });
    }

    return rank(
      [...buckets.values()].map(({ group, eventId, records: bucketRows }) => ({
        group,
        eventId,
        ...tally(bucketRows),
      })),
      (row) => row.group,
      // Ranked on what the question actually declares, and on nothing when it
      // declares no order: every row unranked, alphabetical, rather than an
      // ordering read off whichever option happens to sit first.
      (row) => (isRating ? row.average : row.favourableShare),
    );
  }
}

/** One line per level of a rating scale, so a note reads like any other answer. */
function ratingLevels(
  max: number | null,
  given: number[],
): ClosingQuestionOption[] {
  return Array.from({ length: max ?? 0 }, (_, index) => {
    const stars = index + 1;
    const count = given.filter((v) => v === stars).length;
    return {
      position: index,
      value: String(stars),
      label: `${stars} étoile${stars > 1 ? 's' : ''}`,
      tone: null,
      count,
      share: share(count, given.length),
    };
  });
}

/** Rounded like `share`, so two answers cannot report one average differently. */
function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return (
    Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 100) /
    100
  );
}

/** What the ranking is taken on, said per axis and per question shape. */
function groupAxisDefinition(
  by: ClosingQuestionGroupBy,
  isRating: boolean,
  ordered: boolean,
): string {
  const axis =
    by === 'campus'
      ? 'par campus'
      : by === 'event'
        ? "par événement, « group » étant le nom de l'événement et « eventId » son identifiant, qui est ce qui désigne une ligne puisque plusieurs événements portent le même nom, et ce qu'il faut repasser aux opérations qui prennent un événement"
        : 'par grille de closing, ce qui est la comparaison entre formats : une même question posée par un stage et par un Coding Club est une seule question de la banque, et ces lignes sont sa distribution rendue à chaque format';

  if (isRating) {
    return `Répartition ${axis}, classée par la note moyenne du groupe.`;
  }
  if (ordered) {
    return `Répartition ${axis}, classée par la part de réponses favorables. ${FAVOURABLE_RULE}`;
  }
  return `Répartition ${axis}. Les options de cette question ne portent aucun ordre déclaré, donc les lignes ne sont pas classées : elles reviennent par ordre alphabétique et « rank » vaut null partout. Classer sur une option plutôt qu'une autre inventerait une meilleure réponse que la question ne propose pas.`;
}
