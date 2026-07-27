/**
 * Is the sign-up funnel moving?
 *
 * The funnel says where talents are stuck; it cannot say whether the pile is
 * draining or growing, which is the actual question in the week before an event.
 * This measures the flow: completions per day, and how long a talent takes
 * between opening their account and finishing.
 *
 * "Completed" is dated on the last step of the ladder (the règlement signature),
 * because that is the one that closes the parcours. The duration is measured
 * from the talent row's creation, which is when Salesforce first handed us the
 * person, so it includes the days before they ever logged in: that delay is part
 * of the answer, not noise to be filtered out.
 */

import { prisma } from '$lib/server/db';
import { metric, type Metric } from '$lib/server/adminApi/metrics';
import type { Scope } from '$lib/server/adminApi/scope';
import { cohortWhere, ONBOARDING_COMPLETE_WHERE, scopeLabels } from './cohort';

const DAY_MS = 86_400_000;

export const VELOCITY_DEFAULT_DAYS = 30;
export const VELOCITY_MAX_DAYS = 365;

export type VelocityDay = { day: string; completions: number };

export type OnboardingVelocity = {
  filters: { schoolYear: string; campus: string; event: string; days: number };
  completions: Metric;
  perDay: Metric<VelocityDay[]>;
  busiestDay: Metric<VelocityDay | null>;
  medianDaysToComplete: Metric<number | null>;
};

export async function getOnboardingVelocity(
  scope: Scope = {},
  params: { days?: number } = {},
): Promise<OnboardingVelocity> {
  const days = Math.min(
    Math.max(params.days ?? VELOCITY_DEFAULT_DAYS, 1),
    VELOCITY_MAX_DAYS,
  );
  const since = new Date(Date.now() - days * DAY_MS);
  const cohort = await cohortWhere(scope);

  const rows = await prisma.talent.findMany({
    where: {
      AND: [
        cohort,
        ONBOARDING_COMPLETE_WHERE,
        { rulesSignedAt: { gte: since } },
      ],
    },
    select: { rulesSignedAt: true, createdAt: true },
  });

  const perDayCounts = new Map<string, number>();
  const durations: number[] = [];
  for (const row of rows) {
    if (!row.rulesSignedAt) continue;
    const day = row.rulesSignedAt.toISOString().slice(0, 10);
    perDayCounts.set(day, (perDayCounts.get(day) ?? 0) + 1);
    durations.push(
      (row.rulesSignedAt.getTime() - row.createdAt.getTime()) / DAY_MS,
    );
  }

  const perDay = [...perDayCounts.entries()]
    .map(([day, completions]) => ({ day, completions }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const busiest = [...perDay].sort((a, b) => b.completions - a.completions)[0];

  return {
    filters: { ...scopeLabels(scope), days },
    completions: metric(
      rows.length,
      `Talents du périmètre ayant terminé leur parcours d'inscription au cours des ${days} derniers jours. Compté à la date de signature du règlement, la dernière étape du parcours.`,
    ),
    perDay: metric(
      perDay,
      "Nombre de parcours terminés par jour (date UTC), du plus ancien au plus récent. Les jours sans aucune inscription terminée n'apparaissent pas.",
    ),
    busiestDay: metric(
      busiest ?? null,
      "Le jour où le plus de parcours ont été terminés sur la période. Vaut null si aucun ne l'a été.",
    ),
    medianDaysToComplete: metric(
      median(durations),
      "Durée médiane, en jours, entre l'enregistrement du talent dans Jump et la fin de son parcours d'inscription. La médiane plutôt que la moyenne : quelques talents qui finissent des mois plus tard tireraient une moyenne vers le haut sans rien dire du cas courant. Vaut null si personne n'a terminé sur la période.",
    ),
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  return Math.round(value * 10) / 10;
}
