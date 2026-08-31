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
 * a wrong value is silently ACCEPTED is the admin authoring form, which writes
 * whatever it validates, so that is the site this feeds.
 */

export const INTEREST_KINDS = ['tech', 'general'] as const;

export type InterestKind = (typeof INTEREST_KINDS)[number];
