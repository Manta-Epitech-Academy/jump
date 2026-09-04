/**
 * What one staff member has been doing, for the dialog on `/staff/admin/users`.
 *
 * A service rather than inline route code, for the same reason every other
 * figure in this feature is one: the route is the transport, and a query that
 * decides what a number MEANS does not belong in it. It reads the same store as
 * `read.ts`, at the one granularity that file deliberately does not offer, the
 * individual: the aggregates are actor-free by design, and this is the one
 * surface that legitimately names somebody.
 *
 * **UI only, and it must stay that way.** This is not a candidate for the
 * operation catalogue. `ops_staff_activity` answers the same question in counts
 * with no names, and says so in as many words: "the question is combien and où,
 * and an admin who needs the person opens `/staff/admin/users`". That sentence
 * is the boundary. A named-member read reachable with a token would put
 * per-employee behaviour behind a credential minted for figures.
 *
 * **Connections come from the usage rows, never from `bauth_session`.** The
 * session table is not a login history and the schema says so twice, on both
 * `StaffProfile.firstLoginAt` and `Talent.firstLoginAt`: its rows are deleted by
 * logout, identity repair and relinks, so it under-reports whoever signs out and
 * over-reports whoever never does. Measured on the development database, 6046 of
 * its 6049 rows were expired sessions nobody had closed, which is what a list
 * built on it would have been showing under a heading promising connections.
 * `dev_session` and `admin_session` are the durable answer: one row per real
 * login per space, keyed on the session id, so a re-login is a new row and a
 * fortnight-long session is not fourteen.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import {
  USAGE_FEATURE_DEFS,
  USAGE_RAW_RETENTION_MONTHS,
  USAGE_SPACE_LABELS,
  isUsageFeatureKey,
  usageRawCutoff,
  usageSessionFeatures,
} from '$lib/domain/usage';

/**
 * Both lists are capped, because their length is decided by the data. The
 * figures below them are not: a count that stopped at the cap would read as a
 * plateau for exactly the members who use Jump most.
 */
const RECENT_USES_LIMIT = 40;
export const MEMBER_SESSIONS_LIMIT = 20;

const SESSION_FEATURES = usageSessionFeatures('staff');

export type MemberActivity = {
  /** The window every figure below is measured over. */
  windowMonths: number;
  /**
   * Distinct calendar days with at least one row, and the figure that actually
   * answers "how much does this person come". A login count alone answers it
   * wrongly: a BetterAuth session lives fourteen days (`auth.ts`), so somebody
   * working daily and never signing out produces about two logins a month.
   */
  activeDays: number;
  /** Real logins in the window, one per session per space. */
  loginCount: number;
  uses: { libelle: string; at: Date; impersonated: boolean }[];
  sessions: { espace: string; at: Date; impersonated: boolean }[];
};

export async function getMemberActivity(
  staffProfileId: string,
): Promise<MemberActivity> {
  const since = usageRawCutoff();
  const scope = { staffProfileId, occurredAt: { gte: since } };

  const [uses, sessions, [totals]] = await Promise.all([
    // Everything except the sessions: those get their own section, and one list
    // holding both buried the connections under the page views that outnumber
    // them by an order of magnitude, cap included.
    prisma.usage_FeatureUse.findMany({
      where: { ...scope, feature: { notIn: SESSION_FEATURES } },
      orderBy: { occurredAt: 'desc' },
      take: RECENT_USES_LIMIT,
      select: { feature: true, occurredAt: true, impersonated: true },
    }),
    prisma.usage_FeatureUse.findMany({
      where: { ...scope, feature: { in: SESSION_FEATURES } },
      orderBy: { occurredAt: 'desc' },
      take: MEMBER_SESSIONS_LIMIT,
      select: { feature: true, occurredAt: true, impersonated: true },
    }),
    // `occurredAt` is a `TIMESTAMP(3)` holding UTC, so the cast is the day
    // boundary the rest of this feature already counts in (`read.ts` groups
    // months off the same column the same way).
    //
    // Impersonated rows count here, where the aggregates drop them. That is not
    // an inconsistency: the recorder attributes an impersonated row to the admin
    // doing the impersonating, never to the member being explored, so on this
    // member's own dialog it is their own work, and each row says so.
    prisma.$queryRaw<{ days: number; logins: number }[]>(Prisma.sql`
      SELECT
        COUNT(DISTINCT u."occurredAt"::date)::int AS "days",
        COUNT(*) FILTER (
          WHERE u."feature" IN (${Prisma.join([...SESSION_FEATURES])})
        )::int                                    AS "logins"
      FROM "Usage_FeatureUse" u
      WHERE u."staffProfileId" = ${staffProfileId}
        AND u."occurredAt" >= ${since}
    `),
  ]);

  return {
    windowMonths: USAGE_RAW_RETENTION_MONTHS,
    activeDays: totals?.days ?? 0,
    loginCount: totals?.logins ?? 0,
    uses: uses.map((use) => ({
      // The key is resolved to its French label here rather than in the
      // component, so the catalogue stays the only place that names a feature.
      libelle: isUsageFeatureKey(use.feature)
        ? USAGE_FEATURE_DEFS[use.feature].label
        : use.feature,
      at: use.occurredAt,
      impersonated: use.impersonated,
    })),
    sessions: sessions.map((session) => ({
      // The space, not the feature label: under a heading that already says
      // "Connexions", repeating "Connexions à l'espace dev" on every row says
      // the same word twice and buries the one bit that differs between rows.
      espace: isUsageFeatureKey(session.feature)
        ? USAGE_SPACE_LABELS[USAGE_FEATURE_DEFS[session.feature].space]
        : session.feature,
      at: session.occurredAt,
      impersonated: session.impersonated,
    })),
  };
}
