/**
 * The one way the usage figures are read, whichever store answers.
 *
 * Two stores hold the same measurement at different resolutions:
 * `Usage_FeatureUse` keeps every row for {@link USAGE_RAW_RETENTION_MONTHS}
 * months and still knows who acted, `Usage_FeatureMonthly` keeps an actor-free
 * count per month forever. A window inside the detailed period is answered from
 * the first, anything older from the second, and the caller never picks: they
 * name a number of days and the answer says which side replied.
 *
 * THE POINT OF THIS MODULE IS THAT BOTH SIDES PRODUCE THE SAME SHAPE. Each
 * reader returns {@link MonthlyTally} cells and {@link foldByFeature} turns
 * cells into figures, so a 30-day answer and a 400-day answer are the same
 * figure measured over different spans rather than two different figures wearing
 * one name. Without that, the store boundary would move the meaning of every
 * number that crosses it, and nobody would see it happen.
 *
 * WHAT IS ADDITIVE, because every fold here depends on it. `record.ts` stamps a
 * staff row with the actor's OWN campus and `actorHash` embeds one campus in the
 * pseudonym, so within one month an actor appears under one `campusId` and one
 * `actorKind`. Distinct actors are therefore additive across campuses and across
 * actor kinds INSIDE A MONTH, and additive across nothing else. Not across
 * months, because the talent pseudonym rotates monthly and summing would count
 * one person once per month they were active. Not across features, because one
 * person using three features is one person.
 *
 * That last paragraph is the whole reason the monthly maximum, and not a running
 * total, is what these figures report.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { USAGE_RAW_RETENTION_MONTHS, usageRawCutoff } from '$lib/domain/usage';
import { schoolYearBounds } from '$lib/domain/schoolYear';
import { OperationRefusedError } from '$lib/server/adminApi/errors';
import { metric, type Metric } from '$lib/server/adminApi/metrics';
import type { Scope } from '$lib/server/adminApi/scope';
import { monthBounds, monthsCovering } from './months';

/** Which store answered, so an answer can never look more exact than it is. */
export type UsageStore = 'lignes détaillées' | 'totaux mensuels';

export type UsageWindow = {
  store: UsageStore;
  /** The period actually read, which for the cube is rounded out to months. */
  from: Date;
  to: Date;
  /** The months read, cube only. Null on the detailed path. */
  months: string[] | null;
  /** The period as asked for, before any rounding. */
  asked: { from: Date; to: Date };
};

/** One (feature, month, campus) cell, whichever store produced it. */
export type MonthlyTally = {
  feature: string;
  month: string;
  campusId: string | null;
  uses: number;
  /** Distinct actors within this cell. Exact: one month, one campus. */
  actors: number;
};

export type FeatureTotals = {
  uses: number;
  /** The busiest month's distinct actors. Never a sum across months. */
  peakActors: number;
  /** Which month that was, or null when the feature was never used. */
  peakMonth: string | null;
  /** The last month it was used at all. */
  lastMonth: string | null;
};

/** The window when no school year and no day count are named. */
export const USAGE_DEFAULT_DAYS = 30;

/**
 * The period to read and the store that holds it.
 *
 * NAMING A SCHOOL YEAR MEANS THAT SCHOOL YEAR. Asking for 2025-2026 asks about
 * 2025-2026, not about the last thirty days seen through it, so the day count is
 * a NARROWING of the year and applies only when it was actually passed. It used
 * to default to thirty and intersect regardless, which made every question about
 * a past year empty.
 *
 * And when both are named and they do not meet, this refuses rather than
 * returning that empty range. They cross whenever the year ended longer ago than
 * the window is wide, and the old code took `from` from the day count and `to`
 * from the year, so the range inverted and every feature read zero with the
 * filters echoed back to confirm it. An unknown scope is a refusal and never a
 * zero; a scope that cannot be covered is the same rule one step along.
 */
export function usageWindowFor(
  scope: Scope,
  days: number | undefined,
  now: Date = new Date(),
): UsageWindow {
  let from: Date;
  let to: Date;

  if (scope.schoolYear) {
    const year = schoolYearBounds(scope.schoolYear);
    to = year.to < now ? year.to : now;
    if (days === undefined) {
      from = year.from;
    } else {
      const byDays = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      from = year.from > byDays ? year.from : byDays;
      if (from >= to) {
        throw new OperationRefusedError(
          `La fenêtre de ${days} jours et l'année scolaire ${scope.schoolYear} ne se recouvrent pas : ` +
            `cette année s'est terminée le ${year.to.toISOString().slice(0, 10)}, avant le début de la fenêtre demandée. ` +
            `Redemandez sans « days » pour lire l'année scolaire entière, ou sans « schoolYear » pour lire la fenêtre seule.`,
        );
      }
    }
  } else {
    from = new Date(
      now.getTime() - (days ?? USAGE_DEFAULT_DAYS) * 24 * 60 * 60 * 1000,
    );
    to = now;
  }

  const asked = { from, to };
  if (from >= usageRawCutoff(now)) {
    return { store: 'lignes détaillées', from, to, months: null, asked };
  }

  // Rounded OUTWARD: the cube knows only whole months, and the error that costs
  // something here is declaring a live feature unused.
  const months = monthsCovering(from, to);
  return {
    store: 'totaux mensuels',
    from: monthBounds(months[0]).from,
    to: monthBounds(months[months.length - 1]).to,
    months,
    asked,
  };
}

/**
 * The detailed path: one grouped query rather than every row into a `Set`.
 *
 * Grouped in SQL because the count that matters is DISTINCT actors PER MONTH,
 * which `groupBy` cannot express and which pulling every row into memory got
 * wrong: it accumulated one set over the whole window, so a talent active across
 * three months counted three times and a share could pass 100 %. The month is in
 * the `GROUP BY` here, so the rotation cannot leak into the number.
 *
 * `COUNT(DISTINCT COALESCE(...))` is copied from `rollup.ts` verbatim. The two
 * stores must count the same expression or the test that compares them proves
 * nothing.
 */
export async function readRawTallies(args: {
  features: readonly string[];
  window: UsageWindow;
  campusId?: string | null;
  eventId?: string | null;
}): Promise<MonthlyTally[]> {
  // `Prisma.join([])` emits `IN ()`, a syntax error, and an empty feature list is
  // reachable: `audience: 'talent'` with `space: 'dev'` selects nothing.
  if (args.features.length === 0) return [];

  const rows = await prisma.$queryRaw<
    {
      feature: string;
      month: string;
      campusId: string | null;
      uses: bigint | number;
      actors: bigint | number;
    }[]
  >(Prisma.sql`
    SELECT
      u."feature"                                                      AS "feature",
      to_char(u."occurredAt", 'YYYY-MM')                               AS "month",
      u."campusId"                                                     AS "campusId",
      COUNT(*)::int                                                    AS "uses",
      COUNT(DISTINCT COALESCE(u."staffProfileId", u."actorHash"))::int  AS "actors"
    FROM "Usage_FeatureUse" u
    WHERE u."impersonated" = false
      AND u."feature" IN (${Prisma.join([...args.features])})
      AND u."occurredAt" >= ${args.window.from}
      AND u."occurredAt" <  ${args.window.to}
      ${args.campusId ? Prisma.sql`AND u."campusId" = ${args.campusId}` : Prisma.empty}
      ${args.eventId ? Prisma.sql`AND u."eventId" = ${args.eventId}` : Prisma.empty}
    GROUP BY 1, 2, 3
  `);

  return rows.map((r) => ({
    feature: r.feature,
    month: r.month,
    campusId: r.campusId,
    uses: Number(r.uses),
    actors: Number(r.actors),
  }));
}

/**
 * The cube path.
 *
 * `hasAnyRow` is not a convenience: it is what tells "measured, and nobody used
 * it" apart from "not measured at all". Before the instrumentation existed every
 * month is empty, and reading that as a genuine zero would make every feature
 * look like it collapsed on the day a comparison window crossed the deploy.
 */
export async function readCubeTallies(args: {
  features: readonly string[];
  months: string[];
  campusId?: string | null;
}): Promise<{
  tallies: MonthlyTally[];
  computedAt: Date | null;
  hasAnyRow: boolean;
}> {
  if (args.features.length === 0 || args.months.length === 0) {
    return { tallies: [], computedAt: null, hasAnyRow: false };
  }

  const where = {
    month: { in: args.months },
    ...(args.campusId ? { campusId: args.campusId } : {}),
  };

  const [grouped, anyRow] = await Promise.all([
    prisma.usage_FeatureMonthly.groupBy({
      by: ['feature', 'month', 'campusId'],
      where: { ...where, feature: { in: [...args.features] } },
      // Summed across `actorKind` only, which is inside one month and one
      // campus, where distinct actors are additive.
      _sum: { uses: true, distinctActors: true },
      _max: { computedAt: true },
    }),
    // Deliberately NOT filtered by feature: the question is whether the cube was
    // computed over this period at all, not whether these features appear in it.
    prisma.usage_FeatureMonthly.findFirst({
      where,
      select: { computedAt: true },
      orderBy: { computedAt: 'desc' },
    }),
  ]);

  return {
    tallies: grouped.map((g) => ({
      feature: g.feature,
      month: g.month,
      campusId: g.campusId,
      uses: g._sum.uses ?? 0,
      actors: g._sum.distinctActors ?? 0,
    })),
    computedAt: anyRow?.computedAt ?? null,
    hasAnyRow: anyRow !== null,
  };
}

/** Read the window from whichever store holds it. */
export async function readTallies(args: {
  features: readonly string[];
  window: UsageWindow;
  campusId?: string | null;
  eventId?: string | null;
}): Promise<{
  tallies: MonthlyTally[];
  computedAt: Date | null;
  hasAnyRow: boolean;
}> {
  if (args.window.store === 'lignes détaillées') {
    const tallies = await readRawTallies(args);
    return { tallies, computedAt: null, hasAnyRow: true };
  }
  return readCubeTallies({
    features: args.features,
    months: args.window.months ?? [],
    campusId: args.campusId,
  });
}

/**
 * Cells to figures. The one place a window becomes a number.
 *
 * Uses add up over everything, so they are a plain total. Actors do not, so the
 * reported figure is the busiest month's count: a real integer number of real
 * people, bounded by that month's population, equal to zero exactly when nobody
 * used the feature at all, and monotone in the window (widening it can only
 * raise the maximum, never change what it means). A running total has none of
 * those properties, and a monthly mean has the wrong bias for the decision this
 * feeds: it dilutes a feature used hard in one month of three, which pushes
 * toward deletion.
 *
 * On a tie the LATEST month wins, so a plateau is reported at its most recent
 * point rather than at a date that reads as stale.
 */
export function foldByFeature(
  tallies: MonthlyTally[],
): Map<string, FeatureTotals> {
  const perFeatureMonth = new Map<
    string,
    Map<string, { uses: number; actors: number }>
  >();
  for (const cell of tallies) {
    const months = perFeatureMonth.get(cell.feature) ?? new Map();
    const acc = months.get(cell.month) ?? { uses: 0, actors: 0 };
    acc.uses += cell.uses;
    acc.actors += cell.actors;
    months.set(cell.month, acc);
    perFeatureMonth.set(cell.feature, months);
  }

  const out = new Map<string, FeatureTotals>();
  for (const [feature, months] of perFeatureMonth) {
    let uses = 0;
    let peakActors = 0;
    let peakMonth: string | null = null;
    let lastMonth: string | null = null;
    for (const month of [...months.keys()].sort()) {
      const { uses: u, actors } = months.get(month)!;
      uses += u;
      if (u > 0) lastMonth = month;
      if (actors >= peakActors && actors > 0) {
        peakActors = actors;
        peakMonth = month;
      }
    }
    out.set(feature, { uses, peakActors, peakMonth, lastMonth });
  }
  return out;
}

/** The campuses that used each feature at all, for the gaps and coverage reads. */
export function foldByFeatureCampus(
  tallies: MonthlyTally[],
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const cell of tallies) {
    if (cell.uses <= 0) continue;
    const set = out.get(cell.feature) ?? new Set<string>();
    if (cell.campusId) set.add(cell.campusId);
    out.set(cell.feature, set);
  }
  return out;
}

export type UsageSource = {
  store: UsageStore;
  /** The period actually read, ISO dates. */
  du: string;
  au: string;
  /** The months read, cube only. */
  mois: string[] | null;
  /** When the cube was last computed, cube only. Null means never. */
  calculeLe: string | null;
};

/** The provenance every usage answer carries. */
export function usageSourceMetric(
  window: UsageWindow,
  computedAt: Date | null,
): Metric<UsageSource> {
  return metric<UsageSource>(
    {
      store: window.store,
      du: window.from.toISOString(),
      au: window.to.toISOString(),
      mois: window.months,
      calculeLe: computedAt?.toISOString() ?? null,
    },
    `D'où viennent ces chiffres et sur quoi ils portent exactement. « store » vaut « lignes détaillées » quand la période demandée tient dans les ${USAGE_RAW_RETENTION_MONTHS} derniers mois, la durée de conservation des lignes détaillées, et « totaux mensuels » au-delà. ` +
      `Les totaux mensuels ne connaissent que le mois, la fonctionnalité et le campus : la période est alors arrondie aux mois calendaires qu'elle recouvre, « mois » les liste, et « du » / « au » donnent la période réellement lue, qui peut être plus large que celle demandée. Arrondie vers le haut et non vers le bas, parce qu'une fonctionnalité déclarée inutilisée à tort est l'erreur qui fait supprimer quelque chose qui sert. ` +
      `« calculeLe » est la date du dernier calcul du cube ; s'il vaut null alors que « store » est « totaux mensuels », le cube n'a jamais été calculé sur cette période et aucune absence ici ne veut dire absence d'usage.`,
  );
}
