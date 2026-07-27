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
 * `limites` is the other half of the answer. Jump knows who came and what they
 * said; it does not know who later enrolled at Epitech, because no admission
 * outcome is stored anywhere in this platform. A consumer given only the good
 * figures will fill that gap with a plausible conversion rate, so the boundary
 * travels with the numbers, in the same French the definitions use.
 */

import type { Metric } from '$lib/server/adminApi/metrics';
import type { Scope } from '$lib/server/adminApi/scope';
import { scopeLabels } from './cohort';
import { getEventsOverview } from './eventsOverview';
import { getCohortProfile } from './cohortProfile';
import { getSchoolsReach } from './schoolsReach';
import { getAttendanceRate } from './attendanceRate';
import { getTalentRetention } from './talentRetention';
import { getInterviewInsights } from './interviewInsights';

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
    interviewCoverage: Metric<number | null>;
    satisfaction: Metric<number | null>;
    wantsMore: Metric<unknown>;
    discovery: Metric<unknown>;
  };
  limites: string[];
};

/** What this platform cannot answer, said before anybody infers it. */
const LIMITES = [
  "Jump enregistre qui s'est inscrit, qui est venu et ce que les élèves en ont dit. Il n'enregistre nulle part si un élève a ensuite intégré Epitech : aucun de ces chiffres n'est un taux de conversion ni un taux d'admission, et aucun ne permet d'en déduire un.",
  "Les réponses des élèves proviennent des entretiens d'orientation, menés sur une partie seulement de la cohorte. Le taux de couverture est donné avec elles : plus il est bas, moins elles représentent l'ensemble des participants.",
  "La présence est déduite du statut Salesforce des inscriptions après l'événement. Un événement dont les statuts n'ont pas été mis à jour apparaît sans présence exploitable plutôt que comme une absence générale.",
  'La civilité et le niveau scolaire viennent de Salesforce ou de ce que le talent a saisi ; la part de fiches renseignées est donnée à côté de chaque répartition.',
];

export async function getSchoolYearReview(
  scope: Scope & { schoolYear: string },
): Promise<SchoolYearReview> {
  const [events, cohort, reach, attendance, retention, interviews] =
    await Promise.all([
      getEventsOverview(scope),
      getCohortProfile(scope),
      getSchoolsReach(scope),
      getAttendanceRate(scope),
      getTalentRetention(scope),
      getInterviewInsights(scope),
    ]);

  const question = (field: string) =>
    interviews.questions.value.find((q) => q.field === field);
  const satisfaction = interviews.questions.value.find(
    (q) => q.kind === 'rating',
  );
  const wantsMore = question('wantsMore');
  const discovery = question('discoveryChannel');

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
      interviewCoverage: interviews.coverage,
      satisfaction: {
        value: satisfaction?.average ?? null,
        definition: satisfaction
          ? `Note moyenne donnée par les élèves à la question « ${satisfaction.question} », sur ${satisfaction.max}, portant sur les ${satisfaction.answered} entretiens où elle a été posée. Vaut null si personne n'a répondu.`
          : "La question de satisfaction n'existe pas dans le questionnaire actuel.",
      },
      wantsMore: {
        value: wantsMore?.options ?? [],
        definition: wantsMore
          ? `Réponses à « ${wantsMore.question} », en nombre et en part des ${wantsMore.answered} élèves qui ont répondu. C'est une intention exprimée sur le moment, pas une inscription.`
          : "La question n'existe pas dans le questionnaire actuel.",
      },
      discovery: {
        value: discovery?.options ?? [],
        definition: discovery
          ? `Réponses à « ${discovery.question} », en nombre et en part des ${discovery.answered} élèves qui ont répondu. C'est le canal que l'élève cite lui-même, pas une mesure d'attribution.`
          : "La question n'existe pas dans le questionnaire actuel.",
      },
    },
    limites: LIMITES,
  };
}
