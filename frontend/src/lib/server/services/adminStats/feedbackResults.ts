/**
 * How the feedback forms of a périmètre were answered: how many responses, from
 * where, and the distribution of every closed question.
 *
 * Built on `computeFormStats`, the same aggregation the dev "Bilan" page and the
 * admin responses page render, so a figure quoted from a chat and a figure read
 * off the screen come from one groupBy.
 *
 * With one difference, and it is the point of this wrapper: `computeFormStats`
 * also returns every free-text answer, because those two pages show them to the
 * staff member who owns the form. Free text written by a student in a feedback
 * form was not collected to be quoted, unlike the interview testimonial, so it
 * is dropped here and only counted. The count still tells you there is something
 * to go and read.
 *
 * The form is a filter, not a required key, and that is what makes this reachable
 * at all. It used to take a mandatory `formId` obtainable only from
 * `config_feedback_forms`, a configuration answer national leadership cannot call:
 * the richest satisfaction source in the platform was locked behind a credential
 * that could not open it. Asking "qu'ont répondu les élèves cette année" is one
 * question, so the périmètre selects the questionnaires and naming one narrows the
 * list to it, the same way `campus` narrows a cohort.
 *
 * Scope arrives already resolved ({@link Scope}), never as raw strings. The page
 * this aggregation was written for feeds its campus filter from a dropdown built
 * on `Campus.name`, so an exact match is right there; a caller of this tier types
 * the name, and an unrecognised one has to be a refusal rather than a form
 * nobody answered. Resolving it upstream is what buys that (see `adminApi/scope`).
 */

import { prisma } from '$lib/server/db';
import {
  computeFormStats,
  type FormStats,
  type StatsScope,
} from '$lib/server/feedbackStats';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';
import { metric, share, type Metric } from '$lib/server/adminApi/metrics';
import { UnknownScopeError, type Scope } from '$lib/server/adminApi/scope';
import { scopedEvents, scopeLabels } from './cohort';

/** Questionnaires detailed before the answer stops listing them. */
export const FEEDBACK_FORMS_LIMIT = 10;

export type QuestionResults = {
  question: string;
  type: string;
  answered: number;
  options: { label: string; count: number; share: number | null }[];
  /** Free-text answers left on this question. Counted, never returned. */
  freeTextAnswers: number;
};

export type FormResults = {
  /** Usable as the `formId` filter to come back to this one questionnaire. */
  formId: string;
  form: string;
  submissions: number;
  connectedSubmissions: number;
  publicSubmissions: number;
  responseRate: number | null;
  questions: QuestionResults[];
};

export type FeedbackResults = {
  filters: { schoolYear: string; campus: string; event: string; form: string };
  formsInScope: Metric;
  submissions: Metric;
  forms: Metric<FormResults[]>;
  truncated: boolean;
};

export async function getFeedbackResults(
  scope: Scope = {},
  params: { formId?: string } = {},
): Promise<FeedbackResults> {
  const { events } = await scopedEvents(scope);
  const axis = eventAxis(scope, events);

  const formIds = params.formId
    ? [params.formId]
    : [
        ...new Set(
          events.map((event) => event.feedbackFormId).filter((id) => !!id),
        ),
      ];

  const rows = await Promise.all(
    formIds
      .slice(0, FEEDBACK_FORMS_LIMIT)
      .map((formId) => resultsFor(formId, scope, axis)),
  );

  const labels = scopeLabels(scope);

  return {
    filters: {
      ...labels,
      form: rows.length === 1 && params.formId ? rows[0].form : 'tous',
    },
    formsInScope: metric(
      formIds.length,
      "Questionnaires rattachés à au moins un événement du périmètre. Vaut 1 quand un questionnaire précis a été demandé. Un questionnaire jamais rattaché à un événement n'y figure pas, même s'il existe dans le catalogue.",
    ),
    submissions: metric(
      rows.reduce((total, row) => total + row.submissions, 0),
      'Total des réponses enregistrées sur le périmètre, tous questionnaires détaillés ci-dessous confondus. Une personne ayant répondu à deux questionnaires compte deux fois : ce sont des réponses, pas des répondants.',
    ),
    forms: metric(
      rows,
      "Un questionnaire par ligne. « submissions » est le nombre de réponses, « connectedSubmissions » celles envoyées depuis un compte Jump (donc rattachées à un talent et à son événement), « publicSubmissions » celles envoyées via le lien public sans compte. « responseRate » est la part des inscrits du périmètre ayant répondu depuis leur compte, en pourcentage, et vaut null quand aucun inscrit n'est rattaché à ce questionnaire. « questions » donne la répartition de chaque question fermée, de la réponse la plus à la moins choisie, où « answered » est le nombre de personnes ayant répondu à cette question et les pourcentages portent sur ce nombre ; « freeTextAnswers » compte les réponses libres, dont le contenu ne sort pas de Jump.",
    ),
    truncated: formIds.length > FEEDBACK_FORMS_LIMIT,
  };
}

/**
 * One questionnaire's results, on the périmètre.
 *
 * A form id that resolves to nothing is a refusal, the same posture as an unknown
 * campus: name what would have worked rather than answering zero for a form that
 * does not exist.
 */
async function resultsFor(
  formId: string,
  scope: Scope,
  axis: EventAxis,
): Promise<FormResults> {
  const [stats, invited] = await Promise.all([
    computeFormStats(formId, { ...axis, campusName: scope.campus?.name }),
    invitedCount(formId, scope, axis),
  ]);
  if (!stats) {
    throw new UnknownScopeError(
      `Formulaire « ${formId} » introuvable. Omettez ce filtre pour obtenir tous les questionnaires du périmètre, avec leurs identifiants.`,
    );
  }

  return {
    formId: stats.formId,
    form: stats.title,
    submissions: stats.totalSubmissions,
    connectedSubmissions: stats.authSubmissions,
    publicSubmissions: stats.publicSubmissions,
    responseRate: share(stats.authSubmissions, invited),
    questions: stats.questions.map(toQuestionResults),
  };
}

/**
 * Which events the périmètre selects, in the one shape both the submission count
 * and the invited count read. Derived once because the two have to agree: a
 * response rate whose numerator is scoped to a school year and whose denominator
 * is not would come back above 100 % on a form reused across years.
 */
type EventAxis = Pick<StatsScope, 'eventId' | 'eventIds'>;

/**
 * One event stays one event. A school year becomes the set of its events, which
 * `StatsScope.eventIds` already expresses. A campus alone keeps going through
 * `campusName` with no event filter, because that is the only filter that also
 * catches a public response, matched on the campus the respondent picked
 * themselves; adding an event set there would silently drop those.
 */
function eventAxis(
  scope: Scope,
  events: Awaited<ReturnType<typeof scopedEvents>>['events'],
): EventAxis {
  if (scope.event) return { eventId: scope.event.id };
  if (scope.schoolYear) return { eventIds: events.map((event) => event.id) };
  return {};
}

function toQuestionResults(question: FormStats['questions'][number]) {
  return {
    question: question.prompt,
    type: question.type,
    answered: question.answeredCount,
    options: question.options.map((option) => ({
      label: option.label,
      count: option.count,
      share: share(option.count, question.answeredCount),
    })),
    freeTextAnswers: question.freeTexts.length,
  };
}

/**
 * How many people could have answered: the visible enrolments on the events this
 * form is attached to, within the scope asked for. Zero when the form is only
 * used publicly, in which case a response rate would be a ratio over nothing.
 */
async function invitedCount(
  formId: string,
  scope: Scope,
  axis: EventAxis,
): Promise<number> {
  return prisma.participation.count({
    where: {
      ...visibleParticipationWhere,
      event: {
        feedbackFormId: formId,
        ...(axis.eventId ? { id: axis.eventId } : {}),
        ...(axis.eventIds ? { id: { in: axis.eventIds } } : {}),
        // By id, not by name: the campus is already resolved, and the id is
        // what the column holds.
        ...(scope.campus ? { campusId: scope.campus.id } : {}),
      },
    },
  });
}
