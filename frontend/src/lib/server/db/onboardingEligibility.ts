import type { Prisma } from '@prisma/client';
import { COLLEGE_NIVEAUX } from '$lib/domain/niveau';

/**
 * SQL counterparts of {@link isOnboardingEligible}, shaped as
 * `TalentWhereInput` fragments.
 *
 * Every onboarding aggregate needs them: a collégien never walks the ladder, so
 * counted in, they sit on the first rung forever and drag the completion rate
 * down from the day Coding Clubs return. The predicate and these fragments read
 * the same `COLLEGE_NIVEAUX`, so they cannot disagree about who is in.
 *
 * The explicit `niveau: null` branch is load-bearing, not defensive: SQL's
 * `NULL NOT IN (…)` is NULL, so a `notIn` alone would silently drop every
 * talent whose level has not synced yet - the opposite of the fail-open rule
 * the predicate states.
 *
 * Bare `WhereInput` objects rather than factories, like `db/dossierCompliance`:
 * callers spread them into a where already scoped to their campus or event.
 */
export const onboardingEligibleWhere: Prisma.TalentWhereInput = {
  OR: [{ niveau: null }, { niveau: { notIn: [...COLLEGE_NIVEAUX] } }],
};

export const onboardingNotApplicableWhere: Prisma.TalentWhereInput = {
  niveau: { in: [...COLLEGE_NIVEAUX] },
};
