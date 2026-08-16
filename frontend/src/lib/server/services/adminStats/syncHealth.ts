/**
 * Is Salesforce still talking to us, and is anything stuck?
 *
 * Reads the same `AppSetting` row the worker stamps (`infra/syncStatus`) plus the
 * `SyncError` backlog. The staleness threshold is stated in the answer rather
 * than judged here: a consumer should quote the age, not invent a verdict.
 *
 * What "old" means, and the worker's cadence, belong to `dataFreshness.ts` and are
 * imported: every leadership answer carries that same judgement, and two wordings
 * of one threshold is how an ops screen and a steering figure end up disagreeing
 * about whether the platform is up to date. What this file adds is the part only an
 * operator needs - what the last run actually did, and the backlog it left.
 */

import { prisma } from '$lib/server/db';
import { getLastSync } from '$lib/server/infra/syncStatus';
import { metric, type Metric } from '$lib/server/adminApi/metrics';
import {
  SYNC_STALE_AFTER_HOURS,
  SYNC_CADENCE_NOTE,
  hoursSince,
} from './dataFreshness';

export type SyncHealth = {
  lastSync: Metric<{
    type: string;
    at: string;
    ageHours: number;
    stale: boolean;
    created: number | null;
    updated: number | null;
    skipped: number | null;
  } | null>;
  unresolvedErrors: Metric;
  errorsByType: Metric<{ errorType: string; count: number }[]>;
  oldestUnresolvedAgeDays: Metric<number | null>;
};

export async function getSyncHealth(): Promise<SyncHealth> {
  const [last, unresolved, grouped, oldest] = await Promise.all([
    getLastSync(),
    prisma.syncError.count({ where: { resolved: false } }),
    prisma.syncError.groupBy({
      by: ['errorType'],
      where: { resolved: false },
      _count: { _all: true },
      orderBy: { _count: { errorType: 'desc' } },
    }),
    prisma.syncError.findFirst({
      where: { resolved: false },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
  ]);

  return {
    lastSync: metric(
      last
        ? {
            type: last.type,
            at: last.at.toISOString(),
            ageHours: hoursSince(last.at),
            stale: hoursSince(last.at) > SYNC_STALE_AFTER_HOURS,
            created: last.created ?? null,
            updated: last.updated ?? null,
            skipped: last.skipped ?? null,
          }
        : null,
      `Dernière synchronisation Salesforce reçue par Jump (${SYNC_CADENCE_NOTE}). « ageHours » est son ancienneté en heures ; « stale » vaut vrai au-delà de ${SYNC_STALE_AFTER_HOURS} h, ce qui mérite une vérification. « created », « updated » et « skipped » sont ce que cette dernière passe a fait. Vaut null si aucune synchronisation n'a jamais été enregistrée.`,
    ),
    unresolvedErrors: metric(
      unresolved,
      "Erreurs de synchronisation non traitées : chaque ligne est un talent ou un événement que la synchronisation n'a pas pu rapprocher et qu'un admin doit arbitrer sur /staff/admin/sync-errors.",
    ),
    errorsByType: metric(
      grouped.map((g) => ({ errorType: g.errorType, count: g._count._all })),
      'Répartition des erreurs non traitées par nature technique du conflit.',
    ),
    oldestUnresolvedAgeDays: metric(
      oldest
        ? Math.floor((Date.now() - oldest.createdAt.getTime()) / 86_400_000)
        : null,
      "Ancienneté, en jours, de la plus vieille erreur non traitée. Null s'il n'y en a aucune.",
    ),
  };
}
