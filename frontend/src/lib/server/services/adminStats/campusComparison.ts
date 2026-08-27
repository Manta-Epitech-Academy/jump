/**
 * The same figure across every campus, ranked.
 *
 * The gap this closes: every other aggregate in this folder takes a campus as a
 * *filter* and answers for one périmètre. Comparing fifteen campuses on the share
 * of women or the show-up rate therefore meant fifteen calls and a ranking done by
 * the consumer, which is the one thing this tier exists to prevent. Arbitrating
 * between campuses is the daily work of the people this tier was built for, so the
 * comparison is a figure the platform returns, sorted, not an exercise it sets.
 *
 * The school year is required. Comparing campuses across every year folds the
 * programme's own growth into the comparison (a campus that opened last year would
 * rank last on a cumulative count and read as underperforming), and it bounds the
 * volume this file loads. A campus filter is deliberately NOT accepted: narrowing a
 * comparison to one campus leaves a one-row ranking, which is `stats_cohort_profile`
 * with extra steps.
 *
 * Three narrow queries, not fifteen times N. The trick is that `scopedEvents`
 * already returns every event with its campus name, so the grouping key is the
 * event and the fold into campuses happens in memory. Per-campus counts are derived
 * from id sets rather than re-queried, which is also what keeps "les talents de
 * Lille" meaning the same thing here as in `cohort.ts`: a talent belongs to a
 * campus because they enrolled in one of its events, never by a profile attribute,
 * so a talent who attended two campuses is counted in both.
 *
 * Definitions are imported from the service that owns each rule, never retyped.
 * This answer only adds the framing of its own axis.
 */

import { prisma } from '$lib/server/db';
import { CLOSING_FAVOURABLE_RECOMMENDATIONS } from '$lib/domain/closing';
import { adminEventRunsClosings } from '$lib/server/services/events';
import {
  pastEventPresence,
  VISIBLE_PARTICIPATION_DEFINITION,
} from '$lib/domain/sfMemberStatus';
import {
  metric,
  rank,
  rankAxisNote,
  RANK_UNITS,
  share,
  type Metric,
  type Ranked,
} from '$lib/server/adminApi/metrics';
import type { Scope } from '$lib/server/adminApi/scope';
import {
  scopedEvents,
  participationWhere,
  cohortWhere,
  onboardingCompleteWhere,
} from './cohort';
import {
  WOMEN_SHARE_RULE,
  ONBOARDING_COMPLETED_SHARE_RULE,
} from './cohortProfile';
import { isOnboardingEligible } from '$lib/domain/niveau';
import { SHOW_UP_RATE_RULE } from './attendanceRate';
import {
  CLOSING_COVERAGE_RULE,
  FAVOURABLE_VERDICT_RULE,
} from './closingInsights';
import { DISTINCT_SCHOOLS_RULE } from './schoolsReach';
import { RETURNING_SHARE_RULE } from './talentRetention';

/** One campus's value for one figure, with its position. See {@link Ranked}. */
export type CampusFigure = Ranked<{ campus: string; value: number | null }>;

export type CampusComparison = {
  filters: { schoolYear: string };
  campuses: Metric<number>;
  rankings: {
    cohort: Metric<CampusFigure[]>;
    womenShare: Metric<CampusFigure[]>;
    onboardingCompletedShare: Metric<CampusFigure[]>;
    showUpRate: Metric<CampusFigure[]>;
    schools: Metric<CampusFigure[]>;
    returningShare: Metric<CampusFigure[]>;
    closingCoverage: Metric<CampusFigure[]>;
    favourableVerdictShare: Metric<CampusFigure[]>;
  };
};

/** What every ranking's definition says about the axis, stated once. */
const AXIS_NOTE = rankAxisNote(RANK_UNITS.campus);

/** Per-campus tallies, filled in one pass over the rows loaded below. */
type Tally = {
  talents: Set<string>;
  /** Enrolments per talent, for "came back more than once". */
  enrolments: Map<string, number>;
  present: number;
  /** Enrolments whose Salesforce status concludes on attendance. */
  conclusive: number;
  /** Enrolments on the campus's events that actually conduct closings: the
   *  coverage denominator, never the campus's whole cohort. */
  closingEnrolments: number;
  /** Closings opened on those same events, so the rate cannot exceed 100 %. */
  closings: number;
  /** Closings where the team recorded a verdict, and the favourable half of
   *  them. Separate from `closings`: an open closing has no verdict yet, and
   *  reading the share against every closing would call that unfavourable. */
  verdicts: number;
  favourableVerdicts: number;
};

const emptyTally = (): Tally => ({
  talents: new Set(),
  enrolments: new Map(),
  present: 0,
  conclusive: 0,
  closingEnrolments: 0,
  closings: 0,
  verdicts: 0,
  favourableVerdicts: 0,
});

export async function getCampusComparison(
  scope: Scope & { schoolYear: string },
): Promise<CampusComparison> {
  const { events } = await scopedEvents(scope);

  const campusOf = new Map(events.map((e) => [e.id, e.campusName]));
  const pastEventIds = new Set(
    events.filter((e) => e.status === 'past').map((e) => e.id),
  );
  // The events that actually conduct closings, off the same rule the dev sidebar
  // gates the surface on. Enrolments elsewhere belong to no closing rate: an
  // event with no grid is a configuration fact, not a campus that fell behind.
  const closingEventIds = new Set(
    events.filter(adminEventRunsClosings).map((e) => e.id),
  );

  const enrolmentWhere = await participationWhere(scope);
  const [enrolments, talents, completedRows, closings] = await Promise.all([
    prisma.participation.findMany({
      where: enrolmentWhere,
      select: { talentId: true, eventId: true, sfMemberStatus: true },
    }),
    prisma.talent.findMany({
      where: await cohortWhere(scope),
      select: { id: true, civilite: true, schoolId: true, niveau: true },
    }),
    prisma.talent.findMany({
      where: {
        AND: [await cohortWhere(scope), onboardingCompleteWhere(scope)],
      },
      select: { id: true },
    }),
    prisma.closing_Record.findMany({
      where: { participation: enrolmentWhere },
      select: {
        recommendation: true,
        participation: { select: { eventId: true } },
      },
    }),
  ]);

  const profileOf = new Map(talents.map((t) => [t.id, t]));
  const completed = new Set(completedRows.map((t) => t.id));

  // Every campus with an event in scope appears, even one whose events drew
  // nobody: a campus missing from the ranking would read as "not asked about".
  const tallies = new Map<string, Tally>();
  for (const campus of campusOf.values()) {
    if (!tallies.has(campus)) tallies.set(campus, emptyTally());
  }

  for (const row of enrolments) {
    const campus = campusOf.get(row.eventId);
    if (!campus) continue;
    const tally = tallies.get(campus);
    if (!tally) continue;

    tally.talents.add(row.talentId);
    tally.enrolments.set(
      row.talentId,
      (tally.enrolments.get(row.talentId) ?? 0) + 1,
    );

    // The coverage denominator, which is a question on every enrolment: an event
    // that runs closings owes one per inscription whether it has happened or not.
    if (closingEventIds.has(row.eventId)) tally.closingEnrolments += 1;

    // Presence, by contrast, is only a question on an event that has happened,
    // and only for a status that concludes something - the same two exclusions
    // `attendanceRate` makes, read off the same domain rule.
    if (!pastEventIds.has(row.eventId)) continue;
    const presence = pastEventPresence(row.sfMemberStatus);
    if (presence === 'present') {
      tally.present += 1;
      tally.conclusive += 1;
    } else if (presence === 'absent') {
      tally.conclusive += 1;
    }
  }

  const favourable = new Set<string>(CLOSING_FAVOURABLE_RECOMMENDATIONS);
  for (const row of closings) {
    const eventId = row.participation.eventId;
    if (!closingEventIds.has(eventId)) continue;
    const tally = tallies.get(campusOf.get(eventId) ?? '');
    if (!tally) continue;
    tally.closings += 1;
    if (row.recommendation == null) continue;
    tally.verdicts += 1;
    if (favourable.has(row.recommendation)) tally.favourableVerdicts += 1;
  }

  const figure = (pick: (tally: Tally) => number | null): CampusFigure[] =>
    rank(
      [...tallies.entries()].map(([campus, tally]) => ({
        campus,
        value: pick(tally),
      })),
      (row) => row.campus,
      (row) => row.value,
    );

  const cohortSize = (tally: Tally) => tally.talents.size;

  return {
    filters: { schoolYear: scope.schoolYear },
    campuses: metric(
      tallies.size,
      "Nombre de campus ayant au moins un événement enregistré sur l'année scolaire demandée. Chaque classement ci-dessous compte exactement ce nombre de lignes.",
    ),
    rankings: {
      cohort: metric(
        figure((t) => cohortSize(t)),
        `Talents distincts inscrits à au moins un événement du campus, ${VISIBLE_PARTICIPATION_DEFINITION}. Un talent inscrit sur deux campus est compté dans les deux, donc la somme des lignes peut dépasser la cohorte nationale. ${AXIS_NOTE}`,
      ),
      womenShare: metric(
        figure((t) => {
          const known = [...t.talents].filter(
            (id) => profileOf.get(id)?.civilite != null,
          );
          const women = known.filter(
            (id) => profileOf.get(id)?.civilite === 'femme',
          );
          return share(women.length, known.length);
        }),
        `${WOMEN_SHARE_RULE} Calculée sur les talents du campus ; vaut null quand aucune civilité n'y est renseignée. ${AXIS_NOTE}`,
      ),
      onboardingCompletedShare: metric(
        figure((t) => {
          // Denominator filtered like `womenShare` just above, and for the same
          // reason: ranking campuses on a rate whose denominator holds people
          // who can never move it would rank them on their event mix rather
          // than on how well they chase dossiers. A campus running Coding Clubs
          // would slide down for hosting collégiens.
          const concerned = [...t.talents].filter((id) =>
            isOnboardingEligible(profileOf.get(id)?.niveau),
          );
          const done = concerned.filter((id) => completed.has(id));
          return share(done.length, concerned.length);
        }),
        `${ONBOARDING_COMPLETED_SHARE_RULE} Rapportée ici aux talents concernés du campus ; vaut null quand aucun d'eux n'y est concerné. ${AXIS_NOTE}`,
      ),
      showUpRate: metric(
        figure((t) => share(t.present, t.conclusive)),
        `${SHOW_UP_RATE_RULE} Porte ici sur les événements terminés du campus ; vaut null quand le campus n'a aucune inscription exploitable, notamment quand aucun de ses événements n'est encore passé. ${AXIS_NOTE}`,
      ),
      schools: metric(
        figure(
          (t) =>
            new Set(
              [...t.talents]
                .map((id) => profileOf.get(id)?.schoolId)
                .filter((schoolId): schoolId is string => schoolId != null),
            ).size,
        ),
        `${DISTINCT_SCHOOLS_RULE} Compté ici sur les talents du campus : c'est l'étendue de son réseau de lycées. ${AXIS_NOTE}`,
      ),
      returningShare: metric(
        figure((t) => {
          const returning = [...t.enrolments.values()].filter(
            (count) => count > 1,
          ).length;
          return share(returning, cohortSize(t));
        }),
        `${RETURNING_SHARE_RULE} Comptée ici sur les événements du campus : un talent revenu sur un autre campus ne compte pas comme revenu ici. ${AXIS_NOTE}`,
      ),
      closingCoverage: metric(
        figure((t) => share(t.closings, t.closingEnrolments)),
        `${CLOSING_COVERAGE_RULE} Portée ici sur les événements du campus ; vaut null quand aucun de ses événements ne mène de closing, ce qui est une absence de configuration et non un campus à zéro. ${AXIS_NOTE}`,
      ),
      favourableVerdictShare: metric(
        figure((t) => share(t.favourableVerdicts, t.verdicts)),
        `${FAVOURABLE_VERDICT_RULE} Portée ici sur les closings du campus ; vaut null quand aucun avis n'y a été rendu. Un campus sans closing n'est donc pas un campus sans profil compatible : c'est un campus sur lequel personne n'a été jugé. ${AXIS_NOTE}`,
      ),
    },
  };
}
