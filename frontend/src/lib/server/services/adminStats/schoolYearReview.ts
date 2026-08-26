/**
 * One school year, in one call: the figures somebody would put in front of a
 * board.
 *
 * Composed entirely from the other aggregates, and composed by *selection*: each
 * figure below is the exact `{ value, definition }` its own service produced, not
 * a recomputation. So the review cannot disagree with the operation it came
 * from, and a definition fixed in one place is fixed here too.
 *
 * The school year is required rather than optional. An unbounded "how are we
 * doing" would silently average four years of a growing programme into one
 * number, which is the sort of figure that gets quoted and never questioned.
 *
 * `compareTo` is the one thing selection cannot express, and the reason it exists:
 * "est-ce qu'on progresse" is a single question, so handing back two years and
 * letting the reader subtract them means the growth figure - the one actually
 * quoted - is computed by the consumer, in its own wording. So the same six
 * aggregates run on the compared year and the gaps come back as figures
 * (`metrics.variation`), each carrying what its arithmetic means.
 *
 * `limites` is the other half of the answer. Jump knows who came and what they
 * said; it does not know who later enrolled at Epitech, because no admission
 * outcome is stored anywhere in this platform. A consumer given only the good
 * figures will fill that gap with a plausible conversion rate, so the boundary
 * travels with the numbers, in the same French the definitions use.
 */

import {
  variation,
  type Metric,
  type Variation,
} from '$lib/server/adminApi/metrics';
import type { Scope } from '$lib/server/adminApi/scope';
import { scopeLabels } from './cohort';
import { getEventsOverview } from './eventsOverview';
import { getCohortProfile } from './cohortProfile';
import { getSchoolsReach } from './schoolsReach';
import { getAttendanceRate } from './attendanceRate';
import { getTalentRetention } from './talentRetention';
import { getClosingInsights } from './closingInsights';
import { CLOSING_QUESTION_KEYS } from '$lib/domain/closing';

export type SchoolYearReview = {
  filters: { schoolYear: string; campus: string };
  events: {
    total: Metric;
    visible: Metric;
    participants: Metric;
  };
  cohort: {
    talents: Metric;
    womenShare: Metric<number | null>;
    genderKnownShare: Metric<number | null>;
    onboardingCompletedShare: Metric<number | null>;
  };
  reach: {
    schools: Metric;
    departements: Metric;
    topSchools: Metric<unknown>;
  };
  attendance: {
    pastEvents: Metric;
    enrolled: Metric;
    present: Metric;
    showUpRate: Metric<number | null>;
  };
  loyalty: {
    returningShare: Metric<number | null>;
    averageEventsPerTalent: Metric<number | null>;
  };
  voice: {
    closingCoverage: Metric<number | null>;
    satisfaction: Metric<number | null>;
    wantsMore: Metric<unknown>;
    discovery: Metric<unknown>;
  };
  /** Null unless `compareTo` was asked for. */
  comparaison: SchoolYearComparison | null;
  limites: string[];
};

/**
 * The same headline figures, as movements. Deliberately a subset: a variation is
 * only worth returning where it reads as progress or regression, which a ranking
 * (`topSchools`) or a distribution (`wantsMore`, `discovery`) does not.
 */
export type SchoolYearComparison = {
  schoolYear: string;
  events: { total: Metric<Variation>; participants: Metric<Variation> };
  cohort: {
    talents: Metric<Variation>;
    womenShare: Metric<Variation>;
    onboardingCompletedShare: Metric<Variation>;
  };
  reach: { schools: Metric<Variation>; departements: Metric<Variation> };
  attendance: { present: Metric<Variation>; showUpRate: Metric<Variation> };
  loyalty: { returningShare: Metric<Variation> };
  voice: {
    closingCoverage: Metric<Variation>;
    satisfaction: Metric<Variation>;
  };
};

/** What this platform cannot answer, said before anybody infers it. */
const LIMITES = [
  "Jump enregistre qui s'est inscrit, qui est venu et ce que les élèves en ont dit. Il n'enregistre nulle part si un élève a ensuite intégré Epitech : aucun de ces chiffres n'est un taux de conversion ni un taux d'admission, et aucun ne permet d'en déduire un.",
  "Les réponses des élèves proviennent des entretiens d'orientation, menés sur une partie seulement de la cohorte. Le taux de couverture est donné avec elles : plus il est bas, moins elles représentent l'ensemble des participants.",
  "La présence est déduite du statut Salesforce des inscriptions après l'événement. Un événement dont les statuts n'ont pas été mis à jour apparaît sans présence exploitable plutôt que comme une absence générale.",
  'La civilité et le niveau scolaire viennent de Salesforce ou de ce que le talent a saisi ; la part de fiches renseignées est donnée à côté de chaque répartition.',
];

/**
 * The trap of the comparison block, stated where it happens rather than as a
 * general rule: an in-progress year against a finished one collapses every count,
 * for a reason that says nothing about performance.
 */
const LIMITE_COMPARAISON =
  "Les écarts du bloc « comparaison » rapportent deux années telles qu'elles sont enregistrées aujourd'hui. Si l'année demandée est encore en cours, ses événements ne se sont pas tous tenus : ses effectifs sont partiels et l'écart avec une année terminée sera négatif sans que cela traduise une baisse. Le nombre d'événements des deux années est à lire avant tout écart.";

/** The six aggregates a review is made of, for one périmètre. */
async function gather(scope: Scope) {
  const [events, cohort, reach, attendance, retention, closings] =
    await Promise.all([
      getEventsOverview(scope),
      getCohortProfile(scope),
      getSchoolsReach(scope),
      getAttendanceRate(scope),
      getTalentRetention(scope),
      getClosingInsights(scope),
    ]);
  return { events, cohort, reach, attendance, retention, closings };
}

type Gathered = Awaited<ReturnType<typeof gather>>;

/**
 * The three closing answers the review speaks for, picked by bank key rather than
 * by position: a grid owns its own order, and a review that indexed into it would
 * start quoting a different question the day one is inserted.
 *
 * The keys are named in `CLOSING_QUESTION_KEYS` rather than spelled out here, and
 * an integration test asserts the seeded bank still holds them. A key that quietly
 * stopped existing would otherwise reach a national director as "la question
 * n'existe pas", which reads exactly like "personne n'a répondu".
 */
function voiceOf(closings: Gathered['closings']) {
  const question = (key: string) =>
    closings.questions.value.find((q) => q.key === key);
  return {
    satisfaction: closings.questions.value.find((q) => q.kind === 'rating'),
    wantsMore: question(CLOSING_QUESTION_KEYS.wantsMore),
    discovery: question(CLOSING_QUESTION_KEYS.discoveryChannel),
  };
}

export async function getSchoolYearReview(
  scope: Scope & { schoolYear: string },
  params: { compareTo?: string } = {},
): Promise<SchoolYearReview> {
  const current = await gather(scope);
  // Sequential rather than concurrent with the above: an unknown compared year is
  // refused by `scopedEvents`, and running both at once would fire a dozen queries
  // for a périmètre that turns out not to exist.
  const previous = params.compareTo
    ? await gather({ ...scope, schoolYear: params.compareTo })
    : null;

  const { events, cohort, reach, attendance, retention, closings } = current;
  const voice = voiceOf(closings);

  return {
    filters: {
      schoolYear: scope.schoolYear,
      campus: scopeLabels(scope).campus,
    },
    events: {
      total: events.totals.events,
      visible: events.totals.visible,
      participants: events.totals.participants,
    },
    cohort: {
      talents: cohort.cohort,
      womenShare: cohort.womenShare,
      genderKnownShare: cohort.genderKnownShare,
      onboardingCompletedShare: cohort.onboardingCompletedShare,
    },
    reach: {
      schools: reach.schools,
      departements: reach.departements,
      topSchools: reach.topSchools,
    },
    attendance: {
      pastEvents: attendance.pastEvents,
      enrolled: attendance.enrolled,
      present: attendance.present,
      showUpRate: attendance.showUpRate,
    },
    loyalty: {
      returningShare: retention.returningShare,
      averageEventsPerTalent: retention.averageEventsPerTalent,
    },
    voice: {
      closingCoverage: closings.coverage,
      satisfaction: {
        value: voice.satisfaction?.average ?? null,
        definition: voice.satisfaction
          ? `Note moyenne donnée par les élèves à la question « ${voice.satisfaction.question} », sur ${voice.satisfaction.max}, portant sur les ${voice.satisfaction.answered} closings où elle a été renseignée. Vaut null si personne n'a répondu.`
          : 'Aucune grille de closing du périmètre ne pose de question de satisfaction.',
      },
      wantsMore: {
        value: voice.wantsMore?.options ?? [],
        definition: voice.wantsMore
          ? `Réponses à « ${voice.wantsMore.question} », en nombre et en part des ${voice.wantsMore.answered} élèves qui ont répondu. C'est une intention exprimée sur le moment, pas une inscription.`
          : "La question n'est posée par aucune grille de closing du périmètre.",
      },
      discovery: {
        value: voice.discovery?.options ?? [],
        definition: voice.discovery
          ? `Réponses à « ${voice.discovery.question} », en nombre et en part des ${voice.discovery.answered} élèves qui ont répondu. C'est le canal que l'élève cite lui-même, pas une mesure d'attribution.`
          : "La question n'est posée par aucune grille de closing du périmètre.",
      },
    },
    comparaison:
      previous && params.compareTo
        ? compare(current, previous, params.compareTo)
        : null,
    limites: params.compareTo ? [...LIMITES, LIMITE_COMPARAISON] : LIMITES,
  };
}

/**
 * The movements, read off the two gathered sets. Every figure keeps the `kind` its
 * own scale demands: a count grows by a percentage, a rate or a note out of five
 * moves by points (see `metrics.variation`).
 */
function compare(
  current: Gathered,
  previous: Gathered,
  comparedTo: string,
): SchoolYearComparison {
  const count = (a: number, b: number) => variation(a, b, 'count', comparedTo);
  const points = (a: number | null, b: number | null) =>
    variation(a, b, 'points', comparedTo);

  return {
    schoolYear: comparedTo,
    events: {
      total: count(
        current.events.totals.events.value,
        previous.events.totals.events.value,
      ),
      participants: count(
        current.events.totals.participants.value,
        previous.events.totals.participants.value,
      ),
    },
    cohort: {
      talents: count(current.cohort.cohort.value, previous.cohort.cohort.value),
      womenShare: points(
        current.cohort.womenShare.value,
        previous.cohort.womenShare.value,
      ),
      onboardingCompletedShare: points(
        current.cohort.onboardingCompletedShare.value,
        previous.cohort.onboardingCompletedShare.value,
      ),
    },
    reach: {
      schools: count(current.reach.schools.value, previous.reach.schools.value),
      departements: count(
        current.reach.departements.value,
        previous.reach.departements.value,
      ),
    },
    attendance: {
      present: count(
        current.attendance.present.value,
        previous.attendance.present.value,
      ),
      showUpRate: points(
        current.attendance.showUpRate.value,
        previous.attendance.showUpRate.value,
      ),
    },
    loyalty: {
      returningShare: points(
        current.retention.returningShare.value,
        previous.retention.returningShare.value,
      ),
    },
    voice: {
      closingCoverage: points(
        current.closings.coverage.value,
        previous.closings.coverage.value,
      ),
      satisfaction: points(
        voiceOf(current.closings).satisfaction?.average ?? null,
        voiceOf(previous.closings).satisfaction?.average ?? null,
      ),
    },
  };
}
