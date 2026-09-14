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
  recentRuns,
  SYNC_RUN_RETENTION_DAYS,
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

/** Cap on the run history one call returns. */
export const SYNC_RUNS_LIMIT = 50;

/**
 * The perimeter, as configured, with the one thing a list of Salesforce ids
 * cannot say for itself: whether each source is actually being served.
 *
 * A source sitting on a campus with no Salesforce name is configured and inert,
 * which is exactly what keeps a generated environment out of every sync's
 * scope. Without `servedToWorker` on the row, that reads as a bug rather than
 * as the protection it is.
 */
export async function getSyncSources() {
  const rows = await prisma.sync_Source.findMany({
    orderBy: [{ enabled: 'desc' }, { salesforceCampaignId: 'asc' }],
    select: {
      salesforceCampaignId: true,
      kind: true,
      enabled: true,
      label: true,
      campus: { select: { name: true, externalName: true } },
    },
  });

  const sources = rows.map((r) => ({
    salesforceCampaignId: r.salesforceCampaignId,
    kind: r.kind,
    campus: r.campus.name,
    label: r.label,
    enabled: r.enabled,
    servedToWorker: r.enabled && r.campus.externalName !== null,
  }));

  return {
    sources: metric(
      sources,
      "Campagnes Salesforce suivies. « kind » vaut « parent » quand la campagne est un contenant, auquel cas toutes ses campagnes filles sont synchronisées et une nouvelle fille apparaît d'elle-même au passage suivant, sans rien éditer ici ; « orphan » désigne la campagne elle-même. « enabled » est le choix du staff, « servedToWorker » dit si le worker la reçoit réellement : une source rattachée à un campus sans nom externe Salesforce reste inerte, et c'est ce qui tient les environnements de validation hors de portée de la synchronisation.",
    ),
    served: metric(
      sources.filter((s) => s.servedToWorker).length,
      'Nombre de campagnes réellement transmises au worker au prochain réveil, sur le total ci-dessus.',
    ),
  };
}

/**
 * What the worker actually did, run by run.
 *
 * This is the reason `Sync_Run` exists: the worker is ephemeral, its pod logs
 * go with it, and nobody on the team has kubectl. A run closed in error is not
 * a loss, it is a window that will be replayed, and the answer says so rather
 * than leaving somebody to infer it.
 */
export async function getSyncRuns(params: { limit?: number } = {}) {
  const limit = Math.min(params.limit ?? 20, SYNC_RUNS_LIMIT);
  const runs = await recentRuns(limit);

  return {
    runs: metric(
      runs.map((r) => ({
        mode: r.mode,
        status: r.status,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
        durationSeconds: r.durationSeconds,
        events: r.events,
        talents: r.talents,
        participations: r.participations,
        error: r.error,
      })),
      "Historique des synchronisations, de la plus récente à la plus ancienne. « mode » vaut « incremental » (seules les campagnes modifiées) ou « full » (tout le périmètre, la seule passe qui détecte une suppression côté Salesforce). « status » vaut « ok », « error », ou « running » pour celle en cours. Un run en erreur ne perd rien : la même fenêtre est reprise au réveil suivant, puisque le repère n'avance que sur un succès. Les compteurs sont ce que la passe a poussé. Seules les vraies passes figurent ici : un réveil sans rien à faire n'écrit aucune ligne.",
    ),
    retentionDays: metric(
      SYNC_RUN_RETENTION_DAYS,
      'Ancienneté au-delà de laquelle un compte rendu de synchronisation est supprimé.',
    ),
  };
}
