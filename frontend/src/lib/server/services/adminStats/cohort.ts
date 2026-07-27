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
 * Jump shows, in an event the scope selects. An empty scope is every talent.
 *
 * Note what this deliberately is not: a talent is in scope because they enrolled
 * in a matching event, never because of a profile attribute. "Les talents de
 * Lille" therefore means "les talents inscrits à un événement de Lille", which
 * is the only definition the data supports (a talent belongs to no campus).
 */
export async function cohortWhere(
  scope: Scope,
): Promise<Prisma.TalentWhereInput> {
  if (!scope.event && !scope.campus && !scope.schoolYear) return {};
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
 * The talents who finished the whole online sign-up, charte included. The
 * counterpart of the funnel's rungs: every timestamp on the ladder set.
 */
export const ONBOARDING_COMPLETE_WHERE: Prisma.TalentWhereInput = {
  infoValidatedAt: { not: null },
  highSchoolValidatedAt: { not: null },
  parentsValidatedAt: { not: null },
  techInterestsValidatedAt: { not: null },
  generalInterestsValidatedAt: { not: null },
  equipmentValidatedAt: { not: null },
  processingCompletedAt: { not: null },
  rulesSignedAt: { not: null },
  charterAcceptedAt: { not: null },
};

/** How a scope prints back in an answer's `filters` block. */
export function scopeLabels(scope: Scope) {
  return {
    schoolYear: scope.schoolYear ?? 'toutes',
    campus: scope.campus?.name ?? 'tous',
    event: scope.event?.label ?? 'tous',
  };
}
