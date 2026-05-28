import type { Prisma } from '@prisma/client';

/**
 * Server-side mirrors of the `$lib/domain/stageCompliance` predicates,
 * shaped as Prisma `ParticipationWhereInput` fragments. Kept in lockstep
 * with the JS predicates: a new compliance signal must land in both places
 * or the cohort UI and the dashboard counts drift.
 *
 * These are bare `WhereInput` objects, not factories — they carry no
 * per-event filter. Callers spread them into their own where (or compose
 * with `AND`/`OR`) so they stay scoped to whatever event/campus/etc. the
 * surrounding query already constrains.
 */

/**
 * Participations whose règlement intérieur is satisfied — either signal
 * counts. Mirrors `isRulesCompliant`.
 */
export const rulesCompliantWhere: Prisma.ParticipationWhereInput = {
  OR: [
    { stageCompliance: { charteSigned: true } },
    { talent: { parentRulesSignedAt: { not: null } } },
  ],
};

/**
 * Inverse of `rulesCompliantWhere`: neither the offline-fallback toggle
 * nor the guardian's online co-signature has landed. Used by the
 * "à relancer" funnel to chase those still owing a signature on either
 * track.
 */
export const rulesPendingWhere: Prisma.ParticipationWhereInput = {
  AND: [
    {
      OR: [
        { stageCompliance: null },
        { stageCompliance: { charteSigned: false } },
      ],
    },
    { talent: { parentRulesSignedAt: null } },
  ],
};

/**
 * Participations whose image-rights decision is settled (authorized *or*
 * refused). Mirrors `isImageRightsCompliant`.
 */
export const imageRightsCompliantWhere: Prisma.ParticipationWhereInput = {
  talent: { imageRightsDecidedAt: { not: null } },
};

/**
 * Inverse: image-rights decision still owed.
 */
export const imageRightsPendingWhere: Prisma.ParticipationWhereInput = {
  talent: { imageRightsDecidedAt: null },
};
