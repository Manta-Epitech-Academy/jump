/**
 * What "the cohort in scope" means, in one place.
 *
 * Almost every aggregate in this folder narrows the same two ways - to a campus,
 * an event or a school year, and to the participations Jump actually shows - and
 * each one that spelled that out itself was one more chance for two answers to
 * disagree about who they counted. So the scope-to-rows translation lives here,
 * and the aggregates state what they measured, not who they measured it over.
 *
 * The school year is resolved through `EventService.listAdminEvents`, whose
 * `schoolYearLabel` is the canonical, timezone-aware computation
 * (`domain/schoolYear`). Turning "2026-2027" into a date range here instead would
 * have been a second implementation of the 31 July cutoff, drifting the day
 * somebody fixes one of them.
 */

import type { Prisma } from '@prisma/client';
import { EventService, type AdminEventVM } from '$lib/server/services/events';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';
import { onboardingEligibleWhere } from '$lib/server/db/onboardingEligibility';
import { assertKnownSchoolYear, type Scope } from '$lib/server/adminApi/scope';

export type ScopedEvents = {
  /** The events the scope selects, newest start date first. */
  events: AdminEventVM[];
  /** Every school year that has an event, newest first, before filtering. */
  availableSchoolYears: string[];
};

/**
 * The events a scope selects, with the school year checked to exist.
 *
 * A year with no event would report zeros everywhere and read as a fact, so it
 * is refused here, where the set of real years is already in hand. Shared by the
 * event-shaped aggregates and by {@link cohortWhere}.
 */
export async function scopedEvents(scope: Scope): Promise<ScopedEvents> {
  const all = await EventService.listAdminEvents();
  const availableSchoolYears = [
    ...new Set(all.map((e) => e.schoolYearLabel)),
  ].sort((a, b) => b.localeCompare(a));
  assertKnownSchoolYear(scope.schoolYear, availableSchoolYears);

  return {
    events: all.filter(
      (e) =>
        (!scope.schoolYear || e.schoolYearLabel === scope.schoolYear) &&
        (!scope.campus || e.campusId === scope.campus.id) &&
        (!scope.event || e.id === scope.event.id),
    ),
    availableSchoolYears,
  };
}

/**
 * Prisma filter for the talents in scope: those with at least one participation
 * Jump shows, in an event the scope selects.
 *
 * Note what this deliberately is not: a talent is in scope because they enrolled
 * in a matching event, never because of a profile attribute. "Les talents de
 * Lille" therefore means "les talents inscrits à un événement de Lille", which
 * is the only definition the data supports (a talent belongs to no campus).
 *
 * An empty scope is every talent Jump shows, which is NOT every `Talent` row.
 * This used to short-circuit to `{}` for that case, and the difference is a
 * population no scoped answer ever counts: someone whose only enrolment came back
 * `désisté`, and someone the sync pruned out of every campaign (it deletes the
 * participation and keeps the talent). So an unfiltered figure counted them while
 * its own definition said, verbatim, that it had not - to the tier that quotes
 * definitions rather than re-deriving them. The cohort is one population at every
 * scope, or the sentence travelling with it is only true at some of them.
 *
 * Costs nothing on the empty scope: `participationWhere({})` is the status filter
 * alone, so there is no event list to load and no year to resolve.
 */
export async function cohortWhere(
  scope: Scope,
): Promise<Prisma.TalentWhereInput> {
  return { participations: { some: await participationWhere(scope) } };
}

/**
 * The enrolments a scope selects: visible in Jump, in a matching event. What
 * {@link cohortWhere} is built on, and what the enrolment-shaped aggregates
 * (presence, retention) count rows of directly.
 */
export async function participationWhere(
  scope: Scope,
): Promise<Prisma.ParticipationWhereInput> {
  const where: Prisma.ParticipationWhereInput = {
    ...visibleParticipationWhere,
  };
  if (scope.event) where.eventId = scope.event.id;
  // Through the event, not `Participation.campusId`: the event owns which
  // campus it belongs to, and reading it from there means one source of truth
  // rather than trusting a denormalised copy to have stayed in step.
  if (scope.campus) where.event = { campusId: scope.campus.id };
  if (scope.schoolYear) {
    const { events } = await scopedEvents(scope);
    where.eventId = { in: events.map((e) => e.id) };
  }
  return where;
}

/**
 * The school year an aggregate's onboarding figures are about, or `null` for "the
 * most recent dossier, whichever year it is".
 *
 * Narrowing happens only when the scope names a year, and the reason is that the
 * cohort spans years too. Scoped to 2025-2026, both sides move together: that
 * year's events, that year's dossier, and the answer stops being overwritten the
 * day a returning talent re-onboards. Unscoped, the cohort is everyone who ever
 * enrolled, so pinning the dossier to the year in progress would count every past
 * cohort as blocked on step one - permanently, and worse every year. There the
 * question is "does this talent have a completed dossier at all", which the
 * projection answers as it stands.
 *
 * A single talent's own screens (the wizard, the guards, the admin directory) do
 * pin the year in progress: they ask what this person has to do now, not how a
 * cohort did.
 */
export function dossierSchoolYear(scope: Scope): string | null {
  return scope.schoolYear ?? null;
}

/** Every ladder gate set. Same column names on the projection and on a dossier
 * row, so the one shape serves both readings below. */
const COMPLETE_GATES = {
  infoValidatedAt: { not: null },
  highSchoolValidatedAt: { not: null },
  parentsValidatedAt: { not: null },
  techInterestsValidatedAt: { not: null },
  generalInterestsValidatedAt: { not: null },
  equipmentValidatedAt: { not: null },
  processingCompletedAt: { not: null },
  rulesSignedAt: { not: null },
} as const;

/**
 * The talents who finished the whole online sign-up, charte included.
 *
 * Which dossier that is depends on the scope, and the two readings are not
 * interchangeable ({@link dossierSchoolYear}):
 *
 *   - **A named year** is answered from the dossier rows, not from the flat
 *     columns. Those are a projection of each talent's MOST RECENT dossier, so
 *     the moment a returning talent opens this year's, last year's answer would
 *     change under it - which is the history-overwriting the model exists to end,
 *     and it would end it everywhere except in the figures people quote. The
 *     relation filter costs one EXISTS on a unique index.
 *   - **No year** is answered from the projection, which is what "has a completed
 *     dossier at all" means.
 *
 * `charterAcceptedAt` sits outside either reading: it is a once-per-account
 * consent that a returning talent is never asked for again, so it is a column on
 * the talent and never a condition on a year.
 *
 * Eligibility is folded in so the numerator can never escape its denominator:
 * every rate built on this counts eligible talents only, and a collégien whose
 * level landed after they had already onboarded (a re-import can do that) would
 * otherwise push a share past 100 %.
 */
export function onboardingCompleteWhere(scope: Scope): Prisma.TalentWhereInput {
  const schoolYear = dossierSchoolYear(scope);
  return {
    ...onboardingEligibleWhere,
    charterAcceptedAt: { not: null },
    ...(schoolYear
      ? { onboardingRecords: { some: { schoolYear, ...COMPLETE_GATES } } }
      : COMPLETE_GATES),
  };
}

/** How a scope prints back in an answer's `filters` block. */
export function scopeLabels(scope: Scope) {
  return {
    schoolYear: scope.schoolYear ?? 'toutes',
    campus: scope.campus?.name ?? 'tous',
    event: scope.event?.label ?? 'tous',
  };
}
