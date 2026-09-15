/**
 * How a workshop XP grant is addressed.
 *
 * ONE `XpGrant` per (talent, instance), recomputed on every progress callback
 * rather than appended per validated step, so the talent's timeline carries one
 * line instead of thirty (several of them at "+0 XP") and the rounded total is
 * exactly `budgetMinutes * WORKSHOP_XP_PER_MINUTE`. `grantXp` upserts on
 * `(source, sourceId)`, so a replay writes the same value and a correction
 * repairs in place.
 *
 * The id is the instance slug and the talent, in that order, because the slug is
 * the stable natural key and is never renamed. It is composed and parsed here,
 * and nowhere else: the XP timeline resolves an activity's label by reading the
 * slug back out of it.
 */

const SEPARATOR = ':';

export function workshopGrantSourceId(
  instanceSlug: string,
  talentId: string,
): string {
  return `${instanceSlug}${SEPARATOR}${talentId}`;
}

/** The slug back out of a `workshop` grant's `sourceId`, or null if it is malformed. */
export function workshopSlugFromSourceId(
  sourceId: string | null | undefined,
): string | null {
  if (!sourceId) return null;
  const slug = sourceId.split(SEPARATOR)[0];
  return slug ? slug : null;
}
