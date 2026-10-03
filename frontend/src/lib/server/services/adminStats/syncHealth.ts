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
import { metric, share, type Metric } from '$lib/server/adminApi/metrics';
import {
  classifySfStatus,
  SF_HIDDEN_STATUSES,
  SF_STATUS_CLASS_LABELS,
  SF_VISIBLE_STATUSES,
  type SfStatusClass,
} from '$lib/domain/sfMemberStatus';
import {
  openRunSnapshot,
  recentRuns,
  SYNC_RUN_RETENTION_DAYS,
} from '$lib/server/services/syncRunService';
import type { SyncMode } from '$lib/domain/syncSchedule';
import {
  currentSyncDecision,
  listCadences,
} from '$lib/server/services/syncConfigService';
import { hoursSince, syncFreshnessTerms } from './dataFreshness';
import { eventDisplayName } from '$lib/domain/event';

type PassHealth = {
  at: string;
  ageHours: number;
  stale: boolean;
  events: number | null;
  talents: number | null;
  participations: number | null;
} | null;

/**
 * One event whose deletions a full pass held back, and why.
 *
 * `cause` is derived here rather than left to be read off the counts, because
 * the consumer is told never to compute: an empty roster and one with
 * unresolved members call for different acts (confirm the emptying, or fix the
 * member's SyncError), so the answer names which one it is.
 */
/** Held events listed by name before the answer stops naming them. */
export const PRUNES_HELD_LIMIT = 50;

type HeldPrune = {
  eventId: string;
  event: string;
  campus: string;
  date: string;
  cause: 'empty_roster' | 'unresolved_members';
  pendingRemovals: number;
  sentCount: number;
  resolvedCount: number;
  firstHeldAt: string;
  releasedAt: string | null;
};

/** Events carrying an unrecognised status listed by name before the answer stops. */
export const UNRECOGNISED_STATUS_EVENTS_LIMIT = 50;

/** One Salesforce status as stored, and what the dev space does with it. */
type MemberStatusRow = {
  status: string | null;
  count: number;
  share: number | null;
  devSpace: SfStatusClass;
  devSpaceLabel: string;
};

/** One event holding enrolments whose status Jump does not know. */
type UnrecognisedStatusEvent = {
  eventId: string;
  event: string;
  campus: string;
  date: string;
  count: number;
  statuses: string[];
};

type MemberStatusReport = {
  rows: MemberStatusRow[];
  unrecognised: number;
  events: UnrecognisedStatusEvent[];
  eventsTotal: number;
};

export type SyncHealth = {
  lastIncremental: Metric<PassHealth>;
  lastFull: Metric<PassHealth>;
  cadence: Metric<{ incrementalMinutes: number; fullMinutes: number }>;
  nextRun: Metric<{ due: boolean; mode: string; reason: string }>;
  pendingRequests: Metric<{ full: string | null; incremental: string | null }>;
  runningSince: Metric<string | null>;
  unresolvedErrors: Metric;
  errorsByType: Metric<{ errorType: string; count: number }[]>;
  oldestUnresolvedAgeDays: Metric<number | null>;
  unresolvedSchools: Metric;
  prunesHeldEvents: Metric;
  prunesHeld: Metric<HeldPrune[]>;
  prunesHeldTruncated: boolean;
  memberStatuses: Metric<MemberStatusRow[]>;
  unrecognisedStatuses: Metric;
  unrecognisedStatusEvents: Metric<UnrecognisedStatusEvent[]>;
  unrecognisedStatusEventsTruncated: boolean;
};

/**
 * Every Salesforce member status Jump holds, over every enrolment it stores, and
 * where the ones it does not know are.
 *
 * Deliberately not narrowed to what the dev space shows: the point is to see
 * what it hides. This is the report whose absence let `MET` go unread for a
 * month (#368): a word `domain/sfMemberStatus.ts` does not declare is masked,
 * which is the safe default, and nothing said so. Here it is counted, named and
 * located, so a new word Salesforce starts sending reaches someone instead of
 * quietly emptying a cohort.
 */
async function memberStatusReport(): Promise<MemberStatusReport> {
  const grouped = await prisma.participation.groupBy({
    by: ['eventId', 'sfMemberStatus'],
    _count: { _all: true },
  });

  const byStatus = new Map<string | null, number>();
  const unrecognisedByEvent = new Map<
    string,
    { count: number; statuses: Set<string> }
  >();
  let total = 0;
  for (const row of grouped) {
    const count = row._count._all;
    total += count;
    byStatus.set(
      row.sfMemberStatus,
      (byStatus.get(row.sfMemberStatus) ?? 0) + count,
    );
    if (classifySfStatus(row.sfMemberStatus) !== 'unrecognised') continue;
    const entry = unrecognisedByEvent.get(row.eventId) ?? {
      count: 0,
      statuses: new Set<string>(),
    };
    entry.count += count;
    entry.statuses.add(row.sfMemberStatus!);
    unrecognisedByEvent.set(row.eventId, entry);
  }

  const rows = [...byStatus.entries()]
    .map(([status, count]) => {
      const devSpace = classifySfStatus(status);
      return {
        status,
        count,
        share: share(count, total),
        devSpace,
        devSpaceLabel: SF_STATUS_CLASS_LABELS[devSpace],
      };
    })
    .sort((a, b) => b.count - a.count);

  const events =
    unrecognisedByEvent.size === 0
      ? []
      : await prisma.event.findMany({
          where: { id: { in: [...unrecognisedByEvent.keys()] } },
          orderBy: { date: 'desc' },
          take: UNRECOGNISED_STATUS_EVENTS_LIMIT,
          select: {
            id: true,
            titre: true,
            publicName: true,
            date: true,
            campus: { select: { name: true } },
          },
        });

  return {
    rows,
    unrecognised: rows
      .filter((row) => row.devSpace === 'unrecognised')
      .reduce((sum, row) => sum + row.count, 0),
    events: events.map((event) => {
      const entry = unrecognisedByEvent.get(event.id)!;
      return {
        eventId: event.id,
        event: eventDisplayName(event),
        campus: event.campus.name,
        date: event.date.toISOString().slice(0, 10),
        count: entry.count,
        statuses: [...entry.statuses].sort(),
      };
    }),
    eventsTotal: unrecognisedByEvent.size,
  };
}

async function heldPrunes(): Promise<HeldPrune[]> {
  const rows = await prisma.sync_PruneHold.findMany({
    orderBy: { firstHeldAt: 'asc' },
    take: PRUNES_HELD_LIMIT,
    select: {
      eventId: true,
      pendingRemovals: true,
      sentCount: true,
      resolvedCount: true,
      firstHeldAt: true,
      releasedAt: true,
      event: {
        select: {
          titre: true,
          publicName: true,
          date: true,
          campus: { select: { name: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    eventId: r.eventId,
    event: eventDisplayName(r.event),
    campus: r.event.campus.name,
    date: r.event.date.toISOString().slice(0, 10),
    cause: r.sentCount === 0 ? 'empty_roster' : 'unresolved_members',
    pendingRemovals: r.pendingRemovals,
    sentCount: r.sentCount,
    resolvedCount: r.resolvedCount,
    firstHeldAt: r.firstHeldAt.toISOString(),
    releasedAt: r.releasedAt?.toISOString() ?? null,
  }));
}

/**
 * The last successful pass of one mode, and what it pushed.
 *
 * `staleAfter` is the threshold for THIS mode, never a shared one: the two
 * cadences are an order of magnitude apart, so judging the full reconcile on the
 * incremental's threshold reports a healthy platform as stale for most of every
 * day. `dataFreshness.syncFreshnessTerms` computes one per mode.
 */
async function passHealth(
  mode: SyncMode,
  staleAfter: number,
): Promise<PassHealth> {
  const run = await prisma.sync_Run.findFirst({
    where: { mode, status: 'ok', finishedAt: { not: null } },
    orderBy: { finishedAt: 'desc' },
    select: {
      finishedAt: true,
      eventsCount: true,
      talentsCount: true,
      participationsCount: true,
    },
  });
  if (!run?.finishedAt) return null;

  const ageHours = hoursSince(run.finishedAt);
  return {
    at: run.finishedAt.toISOString(),
    ageHours,
    stale: ageHours > staleAfter,
    events: run.eventsCount,
    talents: run.talentsCount,
    participations: run.participationsCount,
  };
}

export async function getSyncHealth(): Promise<SyncHealth> {
  const terms = await syncFreshnessTerms();

  const [
    incremental,
    full,
    cadences,
    { decision, pending },
    running,
    unresolved,
    grouped,
    oldest,
    unresolvedSchools,
    prunesHeldEvents,
    prunesHeld,
    statuses,
  ] = await Promise.all([
    passHealth('incremental', terms.staleAfterHours.incremental),
    passHealth('full', terms.staleAfterHours.full),
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
    prisma.sync_PruneHold.count(),
    heldPrunes(),
    memberStatusReport(),
  ]);

  const incrementalMinutes =
    cadences.find((c) => c.mode === 'incremental')?.intervalMinutes ?? 0;
  const fullMinutes =
    cadences.find((c) => c.mode === 'full')?.intervalMinutes ?? 0;

  return {
    lastIncremental: metric(
      incremental,
      `Dernière passe incrémentale réussie : elle ne rapatrie que les campagnes modifiées depuis la précédente, et c'est elle qui tient la fraîcheur des données (${terms.cadenceNote}). « ageHours » est son ancienneté en heures ; « stale » vaut vrai au-delà de ${terms.staleAfterHours.incremental} h, ce qui mérite une vérification. « events », « talents » et « participations » sont ce que cette passe a poussé. Vaut null si aucune passe incrémentale n'a jamais réussi.`,
    ),
    lastFull: metric(
      full,
      `Dernière reprise complète réussie : elle rapatrie tout le périmètre et c'est la seule qui détecte une SUPPRESSION côté Salesforce, une inscription retirée d'une campagne ne modifiant aucune date là-bas. Une plateforme dont l'incrémentale va bien mais dont la reprise complète date d'une semaine garde donc des inscrits qui n'existent plus. « ageHours » est son ancienneté en heures ; « stale » vaut vrai au-delà de ${terms.staleAfterHours.full} h, seuil calculé sur SA propre fréquence et non sur celle de l'incrémentale, bien plus serrée : entre deux reprises complètes, une ancienneté de plusieurs heures est le fonctionnement normal et non un retard. « events », « talents » et « participations » sont ce que cette passe a poussé. Vaut null si aucune reprise complète n'a jamais réussi.`,
    ),
    cadence: metric(
      { incrementalMinutes, fullMinutes },
      "Fréquences configurées, en minutes : « incrementalMinutes » entre deux passes incrémentales, « fullMinutes » entre deux reprises complètes. Modifiables par l'opération write_sync_cadence, sans intervention sur l'infrastructure : le worker les relit à chaque réveil. Pour une passe immédiate sans toucher aux fréquences, l'opération ops_request_sync.",
    ),
    nextRun: metric(
      {
        due: decision.shouldSync,
        mode: decision.mode,
        reason: decision.reason,
      },
      "Ce que le worker fera à son prochain réveil : « due » dit si une synchronisation est attendue maintenant, « mode » laquelle, et « reason » pourquoi : « cadence » quand c'est la fréquence configurée qui la rend due, « requested » quand quelqu'un l'a demandée avec ops_request_sync. « due » à faux est le cas normal entre deux passes, pas une panne.",
    ),
    pendingRequests: metric(
      {
        full: pending.full?.toISOString() ?? null,
        incremental: pending.incremental?.toISOString() ?? null,
      },
      'Passes demandées avec ops_request_sync et pas encore faites, avec la date de la demande, ou null pour un mode sans demande en attente. Une demande est satisfaite par la première passe réussie qui DÉMARRE après elle (une reprise complète satisfait aussi une demande incrémentale) : une passe déjà en cours au moment de la demande ne compte pas, et une passe en échec laisse la demande en attente pour le réveil suivant.',
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
    prunesHeldEvents: metric(
      prunesHeldEvents,
      "Nombre d'événements dont la dernière reprise complète a retenu des suppressions d'inscription, détaillés dans « prunesHeld ». C'est le total : la liste peut être plus courte, « prunesHeldTruncated » dit alors que le plafond a été atteint.",
    ),
    prunesHeld: metric(
      prunesHeld,
      `Événements dont la dernière reprise complète a retenu des suppressions d'inscription au lieu de les appliquer, faute de pouvoir les prouver : une reprise complète supprime les inscrits absents de Salesforce, et elle ne le fait que si la liste reçue est complète. Rien n'est perdu ni bloqué, les autres campagnes se synchronisent normalement. « pendingRemovals » est le nombre d'inscriptions conservées en attendant. « cause » vaut « unresolved_members » quand des membres envoyés n'ont pas pu être rattachés à un talent (« resolvedCount » sur « sentCount ») : il faut alors traiter leurs erreurs sur /staff/admin/sync-errors, et la reprise complète suivante appliquera les suppressions d'elle-même. Elle vaut « empty_roster » quand la campagne est arrivée vide : si elle a réellement été vidée dans Salesforce, l'opération ops_release_prune_hold le confirme, et la reprise complète suivante supprime les inscriptions si la campagne lui arrive encore vide ; « releasedAt » est la date de cette confirmation. Seule une campagne arrivée vide se confirme ainsi : un membre non rattaché peut être l'inscrit que la suppression emporterait. Du plus ancien au plus récent, limité à ${PRUNES_HELD_LIMIT} lignes. Liste vide si rien n'est retenu.`,
    ),
    prunesHeldTruncated: prunesHeldEvents > PRUNES_HELD_LIMIT,
    memberStatuses: metric(
      statuses.rows,
      `Toutes les inscriptions que Jump a reçues de Salesforce, réparties par statut Salesforce tel qu'il est enregistré, de la plus à la moins fréquente : « count » en nombre, « share » en pourcentage du total. Aucune n'est absente de Jump ; « devSpace » dit seulement ce que l'espace dev en fait. Il affiche ${SF_VISIBLE_STATUSES.join(' et ')}, ainsi que les inscriptions sans statut (« status » à null, importées avant que Jump n'enregistre le statut). Il masque ${SF_HIDDEN_STATUSES.join(' et ')}, et masque aussi par prudence tout statut que Jump ne connaît pas (« unrecognised »), qui est alors compté dans « unrecognisedStatuses ».`,
    ),
    unrecognisedStatuses: metric(
      statuses.unrecognised,
      "Inscriptions dont le statut Salesforce est un mot que Jump ne connaît pas : elles sont bien dans Jump, mais masquées de l'espace dev par prudence. Tout chiffre non nul mérite d'être regardé : soit Salesforce a introduit un nouveau statut, soit un statut a changé d'orthographe, et dans les deux cas des inscriptions peuvent manquer à l'espace dev. Décider de les afficher est une évolution de Jump, pas un réglage.",
    ),
    unrecognisedStatusEvents: metric(
      statuses.events,
      `Événements qui portent au moins une inscription au statut inconnu de Jump, du plus récent au plus ancien : « count » est le nombre de ces inscriptions, « statuses » les mots reçus. Le détail par talent se lit dans « Membres Salesforce », sur la page Événements de l'espace admin. Limité à ${UNRECOGNISED_STATUS_EVENTS_LIMIT} lignes ; liste vide si aucun statut n'est inconnu.`,
    ),
    unrecognisedStatusEventsTruncated:
      statuses.eventsTotal > UNRECOGNISED_STATUS_EVENTS_LIMIT,
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
