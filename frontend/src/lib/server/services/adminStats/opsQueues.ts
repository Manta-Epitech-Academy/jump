/**
 * The three queues that go wrong quietly: onboarding PDFs, RGPD deletion
 * requests, and Salesforce reconciliation conflicts.
 *
 * What they have in common is that nothing pages anybody when they stall. A
 * failed PDF means a student has no signed règlement to download; a deletion
 * request left sitting is a legal exposure with a one-month clock on it; a pile
 * of unresolved conflicts means Jump and Salesforce quietly disagree about real
 * people. All three are already visible on an admin page nobody opens daily,
 * which is exactly the kind of thing this API exists to make askable.
 *
 * Grouped in one file because they are one habit ("qu'est-ce qui est bloqué ?"),
 * not because they share data. Each stays a separate operation.
 *
 * No talent is named in any of them. Job ids are returned because they are what
 * a retry needs, and a job id identifies a document, not a person.
 */

import { prisma } from '$lib/server/db';
import { isOnboardingPdfJobRetryable } from '$lib/server/services/onboardingPdfJobService';
import { isDeletionRequestOverdue } from '$lib/server/services/talentDeletionService';
import { listSalesforceDiffs } from '$lib/server/services/reconciliationService';
import { metric, share, type Metric } from '$lib/server/adminApi/metrics';

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/** Retryable jobs listed with their ids before the answer stops naming them. */
export const PDF_JOBS_LIMIT = 50;

const ageIn = (unit: number, from: Date) =>
  Math.floor((Date.now() - from.getTime()) / unit);

// ── Onboarding PDF queue ─────────────────────────────────────────────────────

export type StrandedJob = {
  jobId: string;
  documentType: string;
  status: string;
  ageMinutes: number;
};

export type PdfJobsHealth = {
  pending: Metric;
  processing: Metric;
  failed: Metric;
  succeeded: Metric;
  retryable: Metric;
  oldestRetryableAgeMinutes: Metric<number | null>;
  jobs: Metric<StrandedJob[]>;
  truncated: boolean;
};

export async function getPdfJobsHealth(): Promise<PdfJobsHealth> {
  const [grouped, unfinished] = await Promise.all([
    prisma.onboardingPdfJob.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    // Everything not yet successful, so the retryable rule (which depends on
    // how long a `processing` row has been sitting there) is applied on rows,
    // not guessed from counts.
    prisma.onboardingPdfJob.findMany({
      where: { status: { not: 'success' } },
      orderBy: { updatedAt: 'asc' },
      select: {
        id: true,
        documentType: true,
        status: true,
        updatedAt: true,
      },
    }),
  ]);

  const countOf = (status: string) =>
    grouped.find((g) => g.status === status)?._count._all ?? 0;

  const retryable = unfinished.filter(isOnboardingPdfJobRetryable);
  const jobs: StrandedJob[] = retryable.map((job) => ({
    jobId: job.id,
    documentType: job.documentType,
    status: job.status,
    ageMinutes: ageIn(MINUTE_MS, job.updatedAt),
  }));

  return {
    pending: metric(
      countOf('pending'),
      "Documents d'inscription en attente de génération. Une file qui ne descend pas signale un worker arrêté.",
    ),
    processing: metric(
      countOf('processing'),
      'Documents en cours de génération. La génération dure quelques secondes, mais une cohorte entière qui signe en même temps fait attendre les suivants.',
    ),
    failed: metric(
      countOf('error'),
      "Générations en échec. Tant qu'elles ne sont pas relancées, le talent concerné n'a pas de document à télécharger.",
    ),
    succeeded: metric(
      countOf('success'),
      'Documents générés avec succès depuis la mise en service, toutes cohortes confondues.',
    ),
    retryable: metric(
      retryable.length,
      "Générations qu'un admin peut relancer : celles en échec, celles en attente, et celles bloquées en cours depuis assez longtemps pour être considérées comme perdues.",
    ),
    oldestRetryableAgeMinutes: metric(
      jobs.length > 0 ? Math.max(...jobs.map((j) => j.ageMinutes)) : null,
      "Ancienneté, en minutes, de la plus vieille génération relançable. Vaut null s'il n'y en a aucune.",
    ),
    jobs: metric(
      jobs.slice(0, PDF_JOBS_LIMIT),
      `Détail des générations relançables, de la plus ancienne à la plus récente, limité à ${PDF_JOBS_LIMIT} lignes. « jobId » est l'identifiant à passer à l'opération de relance ; il désigne un document, jamais une personne.`,
    ),
    truncated: jobs.length > PDF_JOBS_LIMIT,
  };
}

// ── RGPD deletion queue ──────────────────────────────────────────────────────

export type DeletionQueue = {
  pending: Metric;
  overdue: Metric;
  oldestPendingAgeDays: Metric<number | null>;
  fulfilledLast30Days: Metric;
  rejectedLast30Days: Metric;
};

export async function getAccountDeletionQueue(): Promise<DeletionQueue> {
  const since = new Date(Date.now() - 30 * DAY_MS);
  const [pendingRows, fulfilled, rejected] = await Promise.all([
    prisma.talentDeletionRequest.findMany({
      where: { status: 'pending' },
      orderBy: { requestedAt: 'asc' },
      select: { requestedAt: true },
    }),
    prisma.talentDeletionRequest.count({
      where: { status: 'fulfilled', resolvedAt: { gte: since } },
    }),
    prisma.talentDeletionRequest.count({
      where: { status: 'rejected', resolvedAt: { gte: since } },
    }),
  ]);

  const overdue = pendingRows.filter((r) =>
    isDeletionRequestOverdue(r.requestedAt),
  ).length;
  const oldest = pendingRows[0]?.requestedAt ?? null;

  return {
    pending: metric(
      pendingRows.length,
      "Demandes de suppression de compte en attente d'arbitrage par un administrateur.",
    ),
    overdue: metric(
      overdue,
      "Demandes en attente depuis trop longtemps au regard du délai que Jump s'impose pour honorer une demande d'effacement. Chacune est un risque juridique, pas seulement une tâche en retard.",
    ),
    oldestPendingAgeDays: metric(
      oldest ? ageIn(DAY_MS, oldest) : null,
      "Ancienneté, en jours, de la plus ancienne demande en attente. Vaut null s'il n'y en a aucune.",
    ),
    fulfilledLast30Days: metric(
      fulfilled,
      'Demandes honorées au cours des 30 derniers jours : le compte a été anonymisé.',
    ),
    rejectedLast30Days: metric(
      rejected,
      'Demandes refusées au cours des 30 derniers jours, avec un motif communiqué au talent.',
    ),
  };
}

// ── Salesforce conflicts ─────────────────────────────────────────────────────

export type ConflictField = {
  field: string;
  conflicts: number;
  missingInSalesforce: number;
};

export type SfConflictsSummary = {
  talentsConcerned: Metric;
  conflicts: Metric;
  missingInSalesforce: Metric;
  byField: Metric<ConflictField[]>;
};

export async function getSfConflictsSummary(): Promise<SfConflictsSummary> {
  // The full diff list carries names and emails, because the page it was
  // written for shows them. It is reduced to counts here and nothing else
  // crosses this boundary.
  const diffs = await listSalesforceDiffs();

  const byField = new Map<string, ConflictField>();
  let conflicts = 0;
  let missing = 0;

  for (const talent of diffs) {
    for (const diff of talent.diffs) {
      const bucket = byField.get(diff.field) ?? {
        field: diff.field,
        conflicts: 0,
        missingInSalesforce: 0,
      };
      if (diff.kind === 'conflict') {
        bucket.conflicts++;
        conflicts++;
      } else {
        bucket.missingInSalesforce++;
        missing++;
      }
      byField.set(diff.field, bucket);
    }
  }

  return {
    talentsConcerned: metric(
      diffs.length,
      'Talents pour lesquels Jump et Salesforce ne disent pas la même chose sur au moins un champ confirmé par le talent.',
    ),
    conflicts: metric(
      conflicts,
      'Désaccords francs : le talent a confirmé une valeur, Salesforce en affirme une autre. Un administrateur doit trancher.',
    ),
    missingInSalesforce: metric(
      missing,
      "Champs que le talent a confirmés et que Salesforce n'a pas encore. Rien à arbitrer : la valeur remonte par l'export, puis la ligne disparaît d'elle-même.",
    ),
    byField: metric(
      [...byField.values()].sort(
        (a, b) =>
          b.conflicts +
          b.missingInSalesforce -
          (a.conflicts + a.missingInSalesforce),
      ),
      "Répartition par champ concerné, du plus au moins fréquent. Aucun talent n'est nommé : ce sont des comptages.",
    ),
  };
}

// ── Broadcast deliveries ─────────────────────────────────────────────────────

/** Broadcasts detailed one by one before the answer stops listing them. */
export const BROADCASTS_LIMIT = 30;

export type BroadcastDelivery = {
  broadcastId: string;
  /** The name staff gave the send, and the subject line recipients saw. */
  name: string;
  subject: string | null;
  channel: string;
  status: string;
  createdAt: string;
  recipients: number;
  sent: number;
  failed: number;
  pending: number;
  opened: number;
  deliveryRate: number | null;
  openRate: number | null;
};

export type BroadcastDeliveries = {
  filters: { days: number };
  broadcasts: Metric;
  recipients: Metric;
  sent: Metric;
  failed: Metric;
  deliveryRate: Metric<number | null>;
  perBroadcast: Metric<BroadcastDelivery[]>;
  truncated: boolean;
};

export const BROADCASTS_DEFAULT_DAYS = 30;
export const BROADCASTS_MAX_DAYS = 365;

export async function getBroadcastDeliveries(
  params: { days?: number } = {},
): Promise<BroadcastDeliveries> {
  const days = Math.min(
    Math.max(params.days ?? BROADCASTS_DEFAULT_DAYS, 1),
    BROADCASTS_MAX_DAYS,
  );
  const since = new Date(Date.now() - days * DAY_MS);

  const rows = await prisma.broadcast.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      subjectSnapshot: true,
      channel: true,
      status: true,
      createdAt: true,
      recipients: {
        select: { status: true, openedAt: true },
      },
    },
  });

  const perBroadcast: BroadcastDelivery[] = rows.map((row) => {
    const sent = row.recipients.filter((r) => r.status === 'sent').length;
    const failed = row.recipients.filter((r) => r.status === 'failed').length;
    const pending = row.recipients.filter((r) => r.status === 'pending').length;
    const opened = row.recipients.filter((r) => r.openedAt != null).length;
    return {
      broadcastId: row.id,
      name: row.name,
      subject: row.subjectSnapshot,
      channel: row.channel,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      recipients: row.recipients.length,
      sent,
      failed,
      pending,
      opened,
      deliveryRate: share(sent, sent + failed),
      openRate: row.channel === 'mail' ? share(opened, sent) : null,
    };
  });

  const total = (pick: (row: BroadcastDelivery) => number) =>
    perBroadcast.reduce((sum, row) => sum + pick(row), 0);
  const sent = total((r) => r.sent);
  const failed = total((r) => r.failed);

  return {
    filters: { days },
    broadcasts: metric(
      rows.length,
      `Envois groupés créés sur les ${days} derniers jours, mail et SMS confondus.`,
    ),
    recipients: metric(
      total((r) => r.recipients),
      "Destinataires de ces envois. Aucun n'est nommé ici : ce sont des comptages.",
    ),
    sent: metric(sent, 'Messages effectivement partis.'),
    failed: metric(
      failed,
      'Messages en échec définitif. Un chiffre élevé sur un seul envoi désigne en général un problème de configuration, pas des adresses invalides.',
    ),
    deliveryRate: metric(
      share(sent, sent + failed),
      'Part des messages partis parmi ceux dont le sort est tranché (partis ou en échec), en pourcentage. Les messages encore en attente sont exclus du calcul.',
    ),
    perBroadcast: metric(
      perBroadcast.slice(0, BROADCASTS_LIMIT),
      `Le détail envoi par envoi, du plus récent au plus ancien, limité à ${BROADCASTS_LIMIT} lignes. « openRate » n'existe que pour le mail : un SMS ne se mesure pas à l'ouverture.`,
    ),
    truncated: perBroadcast.length > BROADCASTS_LIMIT,
  };
}
