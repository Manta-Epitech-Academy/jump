/**
 * Whether the usage rows describe a person who could exist.
 *
 * The other checks in this directory read one table at a time: which enum
 * values appear, whether a projection agrees with its ledger, whether every
 * rung of the ladder is standing. None of them can see a member whose feature
 * rows and whose connection rows contradict each other, and that is what the
 * dataset held: `dev_session` and `admin_session` were two keys among 106,
 * drawn like the rest and dated from the feature's position in the draw, while
 * `StaffProfile.lastActiveAt` was written in the first scenario as a constant.
 * A member could therefore show four months of feature use, two connections on
 * unrelated days, and « jamais connecté » on the roster at the same time.
 *
 * In production none of that is expressible. `hooks.server.ts` writes the view
 * row and the session row on the SAME request, from the same context, after the
 * guards; a member with no session has no rows at all, and every day of feature
 * use sits inside a session that a BetterAuth cookie kept alive for at most a
 * fortnight (`auth.ts`).
 *
 * ── The direction that is NOT a rule ─────────────────────────────────────────
 *
 * « Every session day carries a view row » is false in production and must not
 * be asserted: `usageSessionFeature` matches a whole space by prefix while
 * `USAGE_VIEW_ROUTES` names 36 routes, and four view keys are recorded at an
 * endpoint rather than at a route. Somebody opening a dev-space page that is not
 * in the map writes a session row and nothing else. Only the converse holds.
 *
 * Narrowed to `sd_` rows, like every check here: `--check` can be pointed at a
 * database somebody has since logged into, where a real session row is a correct
 * row and not a defect to report.
 */

import type { PrismaClient } from '@prisma/client';
import {
  USAGE_FEATURE_DEFS,
  usageSessionFeatures,
  type UsageFeatureKey,
} from '../../../src/lib/domain/usage';

/**
 * How long a session stays open. `auth.ts` sets `expiresIn` to fourteen days,
 * and it is restated rather than imported because `$lib/server` does not resolve
 * from a plain `bun` script - the same reason `reachability.ts` restates the
 * five-actor floor, and it says so too.
 */
const SESSION_DAYS = 14;

const SESSION_FEATURES = usageSessionFeatures('staff');

/** UTC midnight of a timestamp, so two rows are compared by their day. */
function dayOf(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Which space each staff feature belongs to, from the catalogue itself. */
function spaceOf(feature: string): string | null {
  const definition = (USAGE_FEATURE_DEFS as Record<string, { space: string }>)[
    feature
  ];
  return definition?.space ?? null;
}

export async function usageCoherenceFailures(
  prisma: PrismaClient,
): Promise<string[]> {
  const failures: string[] = [];

  // 1. A member who has never opened their account has done nothing in it.
  const ghosts = await prisma.$queryRaw<{ id: string; rows: bigint }[]>`
    SELECT sp."id", COUNT(u."id") AS rows
    FROM "StaffProfile" sp
    JOIN "Usage_FeatureUse" u ON u."staffProfileId" = sp."id"
    WHERE sp."id" LIKE 'sd_%' AND sp."firstLoginAt" IS NULL
    GROUP BY sp."id"
  `;
  for (const ghost of ghosts) {
    failures.push(
      `${ghost.id} n’a jamais ouvert son compte et porte ${ghost.rows} ligne(s) d’usage`,
    );
  }

  // 2. The activity projection is not older than the facts under it. It is the
  //    same fact as the last visit, and the roster reads it rather than the
  //    rows, so a stale one says « actif il y a 2 jours » about somebody whose
  //    last row is a year old, or the reverse.
  //
  //    To the DAY, not to the instant. In the application the two are stamped
  //    within milliseconds of each other by the same request; in a generated
  //    dataset a visit is a day and the hour on the row is a rendering detail,
  //    so an instant comparison fails on every member for a difference nobody
  //    can see. The day is the claim the roster actually makes.
  const stale = await prisma.$queryRaw<
    { id: string; last: Date; active: Date | null }[]
  >`
    SELECT sp."id", MAX(u."occurredAt") AS last, sp."lastActiveAt" AS active
    FROM "StaffProfile" sp
    JOIN "Usage_FeatureUse" u ON u."staffProfileId" = sp."id"
    WHERE sp."id" LIKE 'sd_%' AND u."impersonated" = false
    GROUP BY sp."id", sp."lastActiveAt"
    HAVING sp."lastActiveAt" IS NULL
        OR MAX(u."occurredAt")::date > sp."lastActiveAt"::date
  `;
  for (const row of stale) {
    failures.push(
      `${row.id} : dernière activité ${row.active?.toISOString().slice(0, 10) ?? 'nulle'} alors que sa dernière ligne d’usage date du ${row.last.toISOString().slice(0, 10)}`,
    );
  }

  // 3. Every feature row sits inside a session of the same space. The session
  //    row is written by the request that opened the space, so it comes first
  //    and no more than a fortnight before.
  const rows = await prisma.usage_FeatureUse.findMany({
    where: { id: { startsWith: 'sd_' }, actorKind: 'staff' },
    select: {
      staffProfileId: true,
      feature: true,
      occurredAt: true,
    },
    orderBy: { occurredAt: 'asc' },
  });

  // (member, space) -> the session openings, in order.
  const openings = new Map<string, Date[]>();
  for (const row of rows) {
    if (!row.staffProfileId) continue;
    if (!SESSION_FEATURES.includes(row.feature as UsageFeatureKey)) continue;
    const key = `${row.staffProfileId}|${spaceOf(row.feature)}`;
    const list = openings.get(key) ?? [];
    list.push(row.occurredAt);
    openings.set(key, list);
  }

  const orphans = new Map<string, number>();
  for (const row of rows) {
    if (!row.staffProfileId) continue;
    if (SESSION_FEATURES.includes(row.feature as UsageFeatureKey)) continue;
    const space = spaceOf(row.feature);
    const key = `${row.staffProfileId}|${space}`;
    const covered = (openings.get(key) ?? []).some((opened) => {
      // Calendar days, not elapsed hours: a session opened at 09:00 and still
      // used at 17:00 on its fourteenth day has not outlived the cookie, and a
      // fractional comparison would call it expired.
      const days = (dayOf(row.occurredAt) - dayOf(opened)) / 86_400_000;
      return days >= 0 && days <= SESSION_DAYS;
    });
    if (!covered) orphans.set(key, (orphans.get(key) ?? 0) + 1);
  }
  for (const [key, count] of orphans) {
    const [profileId, space] = key.split('|');
    failures.push(
      `${profileId} : ${count} ligne(s) sur l’espace ${space} en dehors de toute session ouverte dans les ${SESSION_DAYS} jours`,
    );
  }

  return failures;
}
