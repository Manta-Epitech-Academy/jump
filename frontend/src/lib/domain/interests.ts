/**
 * The interest vocabulary.
 *
 * `Interest.kind` is a closed two-value vocabulary carried by a `String` column
 * rather than by a Prisma enum, which means it announces nothing: no coverage
 * check can see it and no write is refused for carrying a value outside it. That
 * is exactly the blind spot `scripts/seed/assert/stringCatalogues.ts` exists to
 * close, and closing it needs the list to be declared somewhere the seed can
 * import - which is here, since `src/lib/domain` is the one alias-free half of
 * `src/lib`.
 *
 * Deliberately NOT swept through every reader. A `where: { kind: 'tech' }` that
 * carries a typo returns no rows and the screen is visibly empty, so the literal
 * is self-correcting there and the indirection would buy nothing. The one place
 * a wrong value could be silently ACCEPTED is the write that authors one
 * (`write_interest`), which validates against this list, so that is the site
 * this feeds.
 */

import type { Prisma } from '@prisma/client';

export const INTEREST_KINDS = ['tech', 'general'] as const;

export type InterestKind = (typeof INTEREST_KINDS)[number];

/**
 * Prisma where-fragment for the interests onboarding offers. An archived one
 * (`write_interest`) is never offered again, and the talents who picked it keep
 * it, so every read of the catalogue a talent picks from and every write of
 * that pick spreads this, and one that forgets it either offers a retired chip
 * or takes a kept one away.
 */
export const offeredInterestWhere = {
  archivedAt: null,
} satisfies Prisma.InterestWhereInput;
