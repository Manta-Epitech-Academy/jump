/**
 * Is Salesforce still talking to us, and is anything stuck?
 *
 * Reads the `Sync_Run` ledger plus the `SyncError` backlog. The staleness
 * threshold is stated in the answer rather than judged here: a consumer should
 * quote the age, not invent a verdict.
 *
 * What "old" means, and the worker's cadence, belong to `dataFreshness.ts` and are
 * imported: every leadership answer carries that same judgement, and two wordings
 * of one threshold is how an ops screen and a steering figure end up disagreeing
 * about whether the platform is up to date. What this file adds is the part only an
 * operator needs - what the last run of each pass actually did, whether one is
 * running or overdue, and the backlog it left.
 *
 * The two passes are reported separately on purpose. They answer different
 * questions: the incremental is freshness, and the full reconcile is the only
 * pass that notices a DELETION in Salesforce, since removing a member from a
 * campaign moves no modstamp anywhere. A platform whose incremental is healthy
 * and whose full has not landed in a week is not a healthy platform, and one
 * merged "last sync" figure cannot say so.
 */

import { prisma } from '$lib/server/db';
import { metric, type Metric } from '$lib/server/adminApi/metrics';
import {
  lastOkRun,
  openRunSnapshot,
} from '$lib/server/services/syncRunService';
import {
  currentSyncDecision,
  listCadences,
} from '$lib/server/services/syncConfigService';
import { hoursSince, syncFreshnessTerms } from './dataFreshness';

type PassHealth = {
  at: string;
  ageHours: number;
  stale: boolean;
  events: number | null;
  talents: number | null;
  participations: number | null;
} | null;

export type SyncHealth = {
  lastIncremental: Metric<PassHealth>;
  lastFull: Metric<PassHealth>;
  cadence: Metric<{ incrementalMinutes: number; fullMinutes: number }>;
  nextRun: Metric<{ due: boolean; mode: string }>;
  runningSince: Metric<string | null>;
  unresolvedErrors: Metric;
  errorsByType: Metric<{ errorType: string; count: number }[]>;
  oldestUnresolvedAgeDays: Metric<number | null>;
  unresolvedSchools: Metric;
};

async function passHealth(
  mode: 'full' | 'incremental',
  staleAfter: number,
): Promise<PassHealth> {
  const [mark, counters] = await Promise.all([
    lastOkRun(mode),
    prisma.sync_Run.findFirst({
      where: { mode, status: 'ok' },
      orderBy: { finishedAt: 'desc' },
      select: {
        eventsCount: true,
        talentsCount: true,
        participationsCount: true,
      },
    }),
  ]);
  if (!mark) return null;

  return {
    at: mark.finishedAt.toISOString(),
    ageHours: hoursSince(mark.finishedAt),
    stale: hoursSince(mark.finishedAt) > staleAfter,
    events: counters?.eventsCount ?? null,
    talents: counters?.talentsCount ?? null,
    participations: counters?.participationsCount ?? null,
  };
}

export async function getSyncHealth(): Promise<SyncHealth> {
  const terms = await syncFreshnessTerms();

  const [
    incremental,
    full,
    cadences,
    { decision },
    running,
    unresolved,
    grouped,
    oldest,
    unresolvedSchools,
  ] = await Promise.all([
    passHealth('incremental', terms.staleAfterHours),
    passHealth('full', terms.staleAfterHours),
    listCadences(),
    currentSyncDecision(),
    openRunSnapshot(),
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
    prisma.school.count({ where: { resolvedAt: null } }),
  ]);

  const incrementalMinutes =
    cadences.find((c) => c.mode === 'incremental')?.intervalMinutes ?? 0;
  const fullMinutes =
    cadences.find((c) => c.mode === 'full')?.intervalMinutes ?? 0;

  return {
    lastIncremental: metric(
      incremental,
      `Dernière passe incrémentale réussie : elle ne rapatrie que les campagnes modifiées depuis la précédente, et c'est elle qui tient la fraîcheur des données (${terms.cadenceNote}). « ageHours » est son ancienneté en heures ; « stale » vaut vrai au-delà de ${terms.staleAfterHours} h, ce qui mérite une vérification. « events », « talents » et « participations » sont ce que cette passe a poussé. Vaut null si aucune passe incrémentale n'a jamais réussi.`,
    ),
    lastFull: metric(
      full,
      `Dernière reprise complète réussie : elle rapatrie tout le périmètre et c'est la seule qui détecte une SUPPRESSION côté Salesforce, une inscription retirée d'une campagne ne modifiant aucune date là-bas. Une plateforme dont l'incrémentale va bien mais dont la reprise complète date d'une semaine garde donc des inscrits qui n'existent plus. Vaut null si aucune reprise complète n'a jamais réussi.`,
    ),
    cadence: metric(
      { incrementalMinutes, fullMinutes },
      "Fréquences configurées, en minutes : « incrementalMinutes » entre deux passes incrémentales, « fullMinutes » entre deux reprises complètes. Modifiables par l'opération write_sync_cadence, sans intervention sur l'infrastructure : le worker les relit à chaque réveil.",
    ),
    nextRun: metric(
      { due: decision.shouldSync, mode: decision.mode },
      'Ce que le worker fera à son prochain réveil : « due » dit si une synchronisation est attendue maintenant, « mode » laquelle. « due » à faux est le cas normal entre deux passes, pas une panne.',
    ),
    runningSince: metric(
      running ? running.startedAt.toISOString() : null,
      "Début de la synchronisation en cours, ou null s'il n'y en a aucune. Une valeur ancienne signale un run qui n'a jamais été refermé, donc un worker interrompu en plein travail : la fenêtre sera rejouée au réveil suivant, rien n'est perdu.",
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
    unresolvedSchools: metric(
      unresolvedSchools,
      "Lycées créés à partir d'un nom sans que leur UAI ait pu être retrouvé dans l'annuaire de l'éducation nationale : leur ville et leurs codes manquent encore, et l'opération ops_resolve_schools relance la recherche. Compte des lycées, pas des talents : la part des talents dont le lycée n'est pas identifié se lit dans stats_schools_reach.",
    ),
  };
}
