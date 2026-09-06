/**
 * Whether the usage rows describe a person who could exist.
 *
 * The other checks in this directory read one table at a time: which enum
 * values appear, whether a projection agrees with its ledger, whether every
 * rung of the ladder is standing. None of them can see a member whose feature
 * rows and whose connection rows contradict each other, and that is what the
 * dataset held: `dev_connection` and `admin_connection` were two keys among 106,
 * drawn like the rest and dated from the feature's position in the draw, while
 * `StaffProfile.lastActiveAt` was written in the first scenario as a constant.
 * A member could therefore show four months of feature use, two connections on
 * unrelated days, and « jamais connecté » on the roster at the same time.
 *
 * In production none of that is expressible. `hooks.server.ts` writes the view
 * row and the connection row on the SAME request, from the same context, after
 * the guards, so a day of feature use IS a connection day, to the day and not
 * merely to the fortnight. This check used to allow a fortnight, because a
 * connection was one row per BetterAuth session; the rule it now carries is the
 * production invariant exactly.
 *
 * ── The direction that is NOT a rule ─────────────────────────────────────────
 *
 * « Every connection day carries a feature row » is false in production and must
 * not be asserted: `usageConnectionFeature` matches a whole space by prefix
 * while `USAGE_VIEW_ROUTES` names 36 routes, and four view keys are recorded at
 * an endpoint rather than at a route. Somebody opening a dev-space page that is
 * not in the map writes a connection row and nothing else. Only the converse
 * holds.
 *
 * ── The one place the converse is loose too ──────────────────────────────────
 *
 * `admin_api_token_mint` and `admin_api_token_revoke` are recorded on
 * `/(staff)/staff/api-tokens`, a staff route under neither space prefix, so in
 * production a day holding only those two would carry no connection row. The
 * generator writes them on an admin-space visit day like any other admin
 * action, which is the ordinary case and what this rule reads; it is written
 * down so that a failure naming them is understood as the generator drifting
 * rather than as this rule being wrong.
 *
 * Narrowed to `sd_` rows, like every check here: `--check` can be pointed at a
 * database somebody has since logged into, where a real connection row is a
 * correct row and not a defect to report.
 */

import type { PrismaClient } from '@prisma/client';
import {
  USAGE_FEATURE_DEFS,
  usageConnectionFeatures,
  type UsageFeatureKey,
} from '../../../src/lib/domain/usage';

const CONNECTION_FEATURES = usageConnectionFeatures('staff');

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

  // 3. Every feature row falls on a day this member has a connection row of the
  //    same space, and a member holds at most one connection row per space per
  //    day. The two halves are the two things a connection now claims, and the
  //    second is the one nothing else could catch: the id and the dedupe key are
  //    composed differently, so a generator writing two rows for one day would
  //    pass the unique constraint and quietly double somebody's arrivals.
  //
  //    Impersonation is part of the grouping, not an exception to it. An admin
  //    exploring a campus records the dev space against THEMSELVES with the flag
  //    set, on a day they may well have opened the dev space for their own work:
  //    two rows, one day, and legitimately so, which is why `impersonated` is in
  //    the composed dedupe key. Grouping without it reports that pair as a
  //    duplicate, and the generator does produce it on purpose.
  const rows = await prisma.usage_FeatureUse.findMany({
    where: { id: { startsWith: 'sd_' }, actorKind: 'staff' },
    select: {
      staffProfileId: true,
      feature: true,
      occurredAt: true,
      impersonated: true,
    },
    orderBy: { occurredAt: 'asc' },
  });

  // (member, space) -> the days a connection was recorded.
  const connectionDays = new Map<string, Set<number>>();
  const duplicates = new Map<string, number>();
  for (const row of rows) {
    if (!row.staffProfileId) continue;
    if (!CONNECTION_FEATURES.includes(row.feature as UsageFeatureKey)) continue;
    const key = `${row.staffProfileId}|${spaceOf(row.feature)}|${row.impersonated}`;
    const days = connectionDays.get(key) ?? new Set<number>();
    const day = dayOf(row.occurredAt);
    if (days.has(day)) duplicates.set(key, (duplicates.get(key) ?? 0) + 1);
    days.add(day);
    connectionDays.set(key, days);
  }
  for (const [key, count] of duplicates) {
    const [profileId, space] = key.split('|');
    failures.push(
      `${profileId} : ${count} connexion(s) en trop sur l’espace ${space}, une journée en portant plus d’une`,
    );
  }

  const orphans = new Map<string, number>();
  for (const row of rows) {
    if (!row.staffProfileId) continue;
    if (CONNECTION_FEATURES.includes(row.feature as UsageFeatureKey)) continue;
    const key = `${row.staffProfileId}|${spaceOf(row.feature)}|${row.impersonated}`;
    if (connectionDays.get(key)?.has(dayOf(row.occurredAt))) continue;
    orphans.set(key, (orphans.get(key) ?? 0) + 1);
  }
  for (const [key, count] of orphans) {
    const [profileId, space] = key.split('|');
    failures.push(
      `${profileId} : ${count} ligne(s) sur l’espace ${space} un jour sans connexion à cet espace`,
    );
  }

  return failures;
}
