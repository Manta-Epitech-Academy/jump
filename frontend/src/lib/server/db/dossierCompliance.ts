import type { Prisma } from '@prisma/client';

/**
 * Talent-scoped parent-completion predicates, shaped as Prisma
 * `TalentWhereInput` fragments. A guardian is "complete" once they have BOTH
 * co-signed the règlement (`parentRulesSignedAt`) AND settled the image-rights
 * decision (`imageRightsDecidedAt`) - the two acts of the parent fastlogin
 * flow; "blocked" means still owing at least one. Single home for the "parent
 * en attente" rule so the admin talents directory filter and the broadcast
 * `parent`-audience targeting can't drift. Neither carries a parent-on-file
 * gate: callers that need one (the talents list) AND it in, and the broadcast
 * parent audience already skips talents without a guardian.
 *
 * These are bare `WhereInput` objects, not factories. Callers spread them into
 * their own where (or compose with `AND`/`OR`) so they stay scoped to whatever
 * campus/event the surrounding query already constrains.
 */
export const parentBlockedWhere: Prisma.TalentWhereInput = {
  OR: [{ parentRulesSignedAt: null }, { imageRightsDecidedAt: null }],
};

export const parentCompleteWhere: Prisma.TalentWhereInput = {
  parentRulesSignedAt: { not: null },
  imageRightsDecidedAt: { not: null },
};
