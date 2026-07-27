/**
 * How a feedback form was answered: how many responses, from where, and the
 * distribution of every closed question.
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
 * Scope arrives already resolved ({@link Scope}), never as raw strings. The page
 * this aggregation was written for feeds its campus filter from a dropdown built
 * on `Campus.name`, so an exact match is right there; a caller of this tier types
 * the name, and an unrecognised one has to be a refusal rather than a form
 * nobody answered. Resolving it upstream is what buys that (see `adminApi/scope`).
 */

import { prisma } from '$lib/server/db';
import { computeFormStats, type FormStats } from '$lib/server/feedbackStats';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';
import { metric, share, type Metric } from '$lib/server/adminApi/metrics';
import { UnknownScopeError, type Scope } from '$lib/server/adminApi/scope';
import { scopeLabels } from './cohort';

export type QuestionResults = {
  question: string;
  type: string;
  answered: number;
  options: { label: string; count: number; share: number | null }[];
  /** Free-text answers left on this question. Counted, never returned. */
  freeTextAnswers: number;
};

export type FeedbackResults = {
  filters: { form: string; campus: string; event: string };
  submissions: Metric;
  connectedSubmissions: Metric;
  publicSubmissions: Metric;
  responseRate: Metric<number | null>;
  questions: Metric<QuestionResults[]>;
};

export async function getFeedbackResults(
  formId: string,
  scope: Scope = {},
): Promise<FeedbackResults> {
  const stats = await computeFormStats(formId, {
    eventId: scope.event?.id,
    // The canonical `Campus.name`. It matches an authenticated submission
    // through its event's campus; for a public one it is compared to the label
    // the respondent picked, whose options the form's author typed by hand, so
    // that half stays a best effort by nature.
    campusName: scope.campus?.name,
  });
  if (!stats) {
    // Same posture as an unknown campus: name what would have worked rather
    // than answering zero for a form that does not exist.
    throw new UnknownScopeError(
      `Formulaire « ${formId} » introuvable. Les identifiants de formulaire sont renvoyés par l'opération config_feedback_forms.`,
    );
  }

  const invited = await invitedCount(formId, scope);
  const labels = scopeLabels(scope);

  return {
    filters: { form: stats.title, campus: labels.campus, event: labels.event },
    submissions: metric(
      stats.totalSubmissions,
      'Réponses enregistrées pour ce formulaire sur le périmètre demandé, canaux confondus.',
    ),
    connectedSubmissions: metric(
      stats.authSubmissions,
      'Réponses envoyées depuis un compte Jump, donc rattachées à un talent et à son événement.',
    ),
    publicSubmissions: metric(
      stats.publicSubmissions,
      "Réponses envoyées via le lien public, sans compte. Elles ne sont rattachées à aucun événement, et n'entrent donc pas dans le taux de réponse.",
    ),
    responseRate: metric(
      share(stats.authSubmissions, invited),
      invited > 0
        ? 'Part des inscrits du périmètre ayant répondu, en pourcentage : réponses envoyées depuis un compte, rapportées aux inscriptions visibles dans Jump sur les mêmes événements.'
        : "Taux de réponse non calculable : aucun événement du périmètre n'a d'inscrit rattaché à ce formulaire.",
    ),
    questions: metric(
      stats.questions.map(toQuestionResults),
      'Répartition des réponses pour chaque question fermée, de la réponse la plus à la moins choisie. « answered » est le nombre de personnes ayant répondu à cette question, et les pourcentages portent sur ce nombre. « freeTextAnswers » compte les réponses libres, dont le contenu ne sort pas de Jump.',
    ),
  };
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
async function invitedCount(formId: string, scope: Scope): Promise<number> {
  return prisma.participation.count({
    where: {
      ...visibleParticipationWhere,
      event: {
        feedbackFormId: formId,
        ...(scope.event ? { id: scope.event.id } : {}),
        // By id, not by name: the campus is already resolved, and the id is
        // what the column holds.
        ...(scope.campus ? { campusId: scope.campus.id } : {}),
      },
    },
  });
}
