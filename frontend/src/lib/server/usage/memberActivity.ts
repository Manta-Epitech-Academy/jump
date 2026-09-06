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
 * **A coverage, not a log.** This returned the forty most recent gestures and
 * the twenty most recent connections, in reverse chronological order, to the
 * second. That shape answers no decision an admin takes about a member: whether
 * the account still serves is already on the roster row (both dates, and they
 * reach back further than any retention), and "what does this person not know
 * how to do" cannot be read off the forty most recent rows, where an absence
 * means nothing. It could not serve a support diagnosis either, since a row
 * deliberately carries no path, no parameter and no error. So the same rows are
 * folded per feature, and the set the member has NEVER opened is returned
 * beside them - which is the half that turns a report into a decision.
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

import { Prisma, type StaffRole } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { staffSpaceForRole } from '$lib/domain/staff';
import {
  USAGE_FEATURE_DEFS,
  USAGE_FEATURE_KEYS,
  USAGE_RAW_RETENTION_MONTHS,
  USAGE_SPACE_LABELS,
  isUsageFeatureKey,
  usageRawCutoff,
  usageSessionFeatures,
  type UsageSpace,
} from '$lib/domain/usage';

const SESSION_FEATURES = usageSessionFeatures('staff');

/** One feature this member has used, and how much. */
export type MemberFeatureUse = {
  libelle: string;
  espace: string;
  utilisations: number;
  dernierUsage: Date;
  /**
   * How many of those the member produced while impersonating somebody. The
   * recorder attributes an impersonated row to the admin doing the
   * impersonating, never to the person being explored, so on this member's own
   * dialog it is their own work - but it is work done inside someone else's
   * space, and the aggregates drop it, so the row says which part it was.
   */
  enExploration: number;
};

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
  /** Busiest first. Sessions are not in it: they are the two figures above. */
  features: MemberFeatureUse[];
  /**
   * What this member has not opened once, over the spaces they work in. The
   * actionable half: an absence here IS an absence, which is exactly what a
   * capped list of recent rows could never say.
   *
   * Empty when the window holds no row at all, because then nothing was
   * measured and nothing can be said. `neverOpened` carries the argument.
   */
  jamaisOuvertes: { libelle: string; espace: string }[];
};

/**
 * `null` when no such profile exists, so the route can answer 404 rather than
 * describing a member who is not there with a page of zeroes.
 */
export async function getMemberActivity(
  staffProfileId: string,
): Promise<MemberActivity | null> {
  const profile = await prisma.staffProfile.findUnique({
    where: { id: staffProfileId },
    select: { staffRole: true },
  });
  if (!profile) return null;

  const since = usageRawCutoff();
  const scope = { staffProfileId, occurredAt: { gte: since } };

  const [grouped, [totals]] = await Promise.all([
    // One row per (feature, impersonation), folded below: the two halves of a
    // feature's count have to be told apart on the row, and asking for them
    // separately would be two queries answering one question.
    prisma.usage_FeatureUse.groupBy({
      by: ['feature', 'impersonated'],
      where: scope,
      _count: { _all: true },
      _max: { occurredAt: true },
    }),
    // `occurredAt` is a `TIMESTAMP(3)` holding UTC, so the cast is the day
    // boundary the rest of this feature already counts in (`read.ts` groups
    // months off the same column the same way).
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

  const byFeature = new Map<string, MemberFeatureUse>();
  const touched = new Set<string>();
  for (const row of grouped) {
    touched.add(row.feature);
    // Sessions are the two counters above, not a feature somebody chose to use.
    if ((SESSION_FEATURES as string[]).includes(row.feature)) continue;
    const at = row._max.occurredAt;
    if (!at) continue;
    // A key the catalogue no longer declares still has rows, and they are still
    // this member's work: the raw key stands in for the label rather than the
    // row being dropped.
    const definition = isUsageFeatureKey(row.feature)
      ? USAGE_FEATURE_DEFS[row.feature]
      : null;
    const entry = byFeature.get(row.feature) ?? {
      // The key is resolved to its French label here rather than in the
      // component, so the catalogue stays the only place that names a feature.
      libelle: definition?.label ?? row.feature,
      espace: definition ? USAGE_SPACE_LABELS[definition.space] : '',
      utilisations: 0,
      dernierUsage: at,
      enExploration: 0,
    };
    entry.utilisations += row._count._all;
    if (row.impersonated) entry.enExploration += row._count._all;
    if (at > entry.dernierUsage) entry.dernierUsage = at;
    byFeature.set(row.feature, entry);
  }

  const features = [...byFeature.values()].sort(
    (a, b) =>
      b.utilisations - a.utilisations ||
      b.dernierUsage.getTime() - a.dernierUsage.getTime(),
  );

  return {
    windowMonths: USAGE_RAW_RETENTION_MONTHS,
    activeDays: totals?.days ?? 0,
    loginCount: totals?.logins ?? 0,
    features,
    jamaisOuvertes: neverOpened(profile.staffRole, touched),
  };
}

/**
 * The catalogue this member has not opened once, over the spaces they work in.
 *
 * The spaces are the one their role gives them plus any they have actually
 * produced a row in: an admin exploring a campus records dev-space rows against
 * themselves, so their own space is not the whole answer, and a `dev` has no
 * admin space, so naming the admin catalogue for them would be a reproach for
 * something they cannot reach.
 *
 * **Nothing measured is not everything unused, and that branch is the point of
 * this being a function.** A member whose last visit predates the retention has
 * no row in the window, and answering that with their whole catalogue names
 * twenty-six features for a `dev` and seventy for an admin under a heading that
 * reads « jamais ouvertes ». It is the error `AGENTS.md` singles out on the
 * digest's own adoption section: an absence of rows is an absence of
 * measurement, and printing it as a list of unused features is the one that
 * makes somebody retire something in use. « Ce compte sert-il encore » is
 * already answered for that member, by the two dates on the roster row, which
 * reach back further than any retention. So the answer here is nothing at all.
 *
 * An empty answer therefore reads « rien à signaler » in both directions - that
 * or the member has opened everything - which is what the caller renders it as.
 */
function neverOpened(
  staffRole: StaffRole | null,
  touched: ReadonlySet<string>,
): { libelle: string; espace: string }[] {
  if (touched.size === 0) return [];

  const spaces = new Set<UsageSpace>();
  const own = staffSpaceForRole(staffRole);
  if (own) spaces.add(own);
  for (const feature of touched)
    if (isUsageFeatureKey(feature))
      spaces.add(USAGE_FEATURE_DEFS[feature].space);

  return USAGE_FEATURE_KEYS.filter((key) => {
    const definition = USAGE_FEATURE_DEFS[key];
    return (
      definition.audience === 'staff' &&
      definition.kind !== 'session' &&
      spaces.has(definition.space) &&
      !touched.has(key)
    );
  }).map((key) => ({
    libelle: USAGE_FEATURE_DEFS[key].label,
    espace: USAGE_SPACE_LABELS[USAGE_FEATURE_DEFS[key].space],
  }));
}
