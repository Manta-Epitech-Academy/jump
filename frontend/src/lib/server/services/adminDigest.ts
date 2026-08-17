/**
 * The weekly admin digest: what needs configuring, and whether Salesforce is
 * still feeding us.
 *
 * Zero new surface. It reads exactly the same services as the curated API and the
 * MCP tools, so the figures in the PO's inbox and the figures an admin gets by
 * asking cannot disagree. If a definition changes, it changes here too, because
 * the definitions travel with the numbers.
 *
 * Recipients are every admin-role account's login email, derived from the roster
 * rather than configured: an admin who joins gets the digest, one who leaves stops
 * getting it, with nothing to remember.
 *
 * Sending goes through the mail façade, so the outbound gate applies untouched: on
 * a trapped environment this lands in the dev-redirect inbox, which is correct.
 */

import { prisma } from '$lib/server/db';
import { sendEmail, MAIL_FROM } from '$lib/server/email';
import { getUnconfiguredEvents } from '$lib/server/services/adminStats/unconfiguredEvents';
import { getSyncHealth } from '$lib/server/services/adminStats/syncHealth';
import {
  getPdfJobsHealth,
  getAccountDeletionQueue,
} from '$lib/server/services/adminStats/opsQueues';

/** How many events to list in the mail before deferring to the cockpit. */
const LISTED_EVENTS = 15;

export type AdminDigest = {
  subject: string;
  html: string;
  text: string;
  /** Structured counts, so the job can log what it announced. */
  summary: {
    eventsToPrepare: number;
    unresolvedSyncErrors: number;
    lastSyncAgeHours: number | null;
    failedPdfJobs: number;
    overdueDeletionRequests: number;
  };
};

const esc = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export async function buildAdminDigest(): Promise<AdminDigest> {
  const [events, sync, pdfJobs, deletions] = await Promise.all([
    getUnconfiguredEvents(),
    getSyncHealth(),
    getPdfJobsHealth(),
    getAccountDeletionQueue(),
  ]);

  const toPrepare = events.toPrepare.value;
  const listed = events.events.value.slice(0, LISTED_EVENTS);
  // Counted off the total, NOT off the returned list: that list is itself capped
  // at UNCONFIGURED_EVENTS_LIMIT, so subtracting from its length made the mail
  // contradict its own lead ("200 événements demandent une action" above a table
  // of 15 plus "et 85 autres") as soon as the cap was reached.
  const remaining = toPrepare - listed.length;
  const last = sync.lastSync.value;

  const eventRows = listed
    .map(
      (e) => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${esc(e.titre)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${esc(e.campus)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${esc(e.dateLabel)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${esc(e.missing.join(', ') || e.configStateLabel)}</td>
        </tr>`,
    )
    .join('');

  const eventsSection =
    toPrepare === 0
      ? `<p style="margin:0 0 16px;">Aucun événement à préparer : tout ce qui arrive est configuré et visible.</p>`
      : `
      <p style="margin:0 0 8px;">
        <strong>${toPrepare}</strong> ${plural(toPrepare, 'événement demande', 'événements demandent')}
        encore une action avant l'arrivée de ${plural(toPrepare, 'sa cohorte', 'leurs cohortes')}.
      </p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;margin:0 0 8px;">
        <thead>
          <tr style="text-align:left;background:#f3f4f6;">
            <th style="padding:6px 10px;">Événement (Salesforce)</th>
            <th style="padding:6px 10px;">Campus</th>
            <th style="padding:6px 10px;">Dates</th>
            <th style="padding:6px 10px;">Ce qui manque</th>
          </tr>
        </thead>
        <tbody>${eventRows}</tbody>
      </table>
      ${
        remaining > 0
          ? `<p style="margin:0 0 16px;font-size:13px;color:#6b7280;">Et ${remaining} autre${remaining > 1 ? 's' : ''} : la liste complète est sur la page Événements de l'espace admin.</p>`
          : ''
      }`;

  const syncSection = `
    <p style="margin:0 0 8px;">
      ${
        last
          ? `Dernière synchronisation Salesforce il y a <strong>${last.ageHours} h</strong>${last.stale ? ' (à vérifier)' : ''}.`
          : 'Aucune synchronisation Salesforce enregistrée à ce jour.'
      }
      ${
        sync.unresolvedErrors.value === 0
          ? 'Aucune erreur en attente.'
          : `<strong>${sync.unresolvedErrors.value}</strong> ${plural(sync.unresolvedErrors.value, 'erreur', 'erreurs')} de synchronisation à arbitrer.`
      }
    </p>`;

  // Two queues nothing else chases. A failed document means a talent has no
  // règlement to download; an overdue erasure request is a legal exposure with
  // a clock on it, and until now it only surfaced if somebody opened the page.
  const failedPdfJobs = pdfJobs.failed.value;
  const overdueDeletions = deletions.overdue.value;
  const pendingDeletions = deletions.pending.value;
  const queueLines = [
    failedPdfJobs > 0
      ? `<strong>${failedPdfJobs}</strong> ${plural(failedPdfJobs, 'document non généré', 'documents non générés')} : ${plural(failedPdfJobs, 'le talent concerné ne peut pas le télécharger', 'les talents concernés ne peuvent pas les télécharger')}.`
      : '',
    overdueDeletions > 0
      ? `<strong>${overdueDeletions}</strong> ${plural(overdueDeletions, 'demande de suppression de compte a dépassé', 'demandes de suppression de compte ont dépassé')} le délai que nous nous imposons.`
      : pendingDeletions > 0
        ? `${pendingDeletions} ${plural(pendingDeletions, 'demande de suppression de compte est en attente', 'demandes de suppression de compte sont en attente')}, encore dans les délais.`
        : '',
  ].filter(Boolean);

  const queueSection = queueLines.length
    ? `<ul style="margin:0 0 16px;padding-left:18px;">${queueLines.map((line) => `<li>${line}</li>`).join('')}</ul>`
    : `<p style="margin:0 0 16px;">Aucune file en attente : documents générés, aucune demande de suppression en retard.</p>`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;line-height:1.5;">
      <h1 style="font-size:18px;margin:0 0 4px;">Jump - point hebdomadaire</h1>
      <p style="margin:0 0 16px;color:#6b7280;font-size:13px;">
        Préparation des événements, files en attente et santé de la
        synchronisation Salesforce.
      </p>
      <h2 style="font-size:15px;margin:0 0 8px;">Événements à préparer</h2>
      ${eventsSection}
      <h2 style="font-size:15px;margin:0 0 8px;">Files en attente</h2>
      ${queueSection}
      <h2 style="font-size:15px;margin:0 0 8px;">Synchronisation</h2>
      ${syncSection}
      <p style="margin:24px 0 0;color:#6b7280;font-size:12px;">
        Message automatique, envoyé chaque lundi aux administrateurs de Jump.
      </p>
    </div>`;

  const textLines = [
    'Jump - point hebdomadaire',
    '',
    `Événements à préparer : ${toPrepare}`,
    ...listed.map(
      (e) =>
        `  - ${e.titre} (${e.campus}, ${e.dateLabel}) : ${e.missing.join(', ') || e.configStateLabel}`,
    ),
    remaining > 0 ? `  ... et ${remaining} autre(s).` : '',
    '',
    `Documents non générés : ${failedPdfJobs}`,
    `Demandes de suppression en attente : ${pendingDeletions}${overdueDeletions > 0 ? ` (dont ${overdueDeletions} hors délai)` : ''}`,
    '',
    last
      ? `Dernière synchronisation Salesforce : il y a ${last.ageHours} h${last.stale ? ' (à vérifier)' : ''}.`
      : 'Aucune synchronisation Salesforce enregistrée.',
    `Erreurs de synchronisation à arbitrer : ${sync.unresolvedErrors.value}`,
  ].filter(Boolean);

  return {
    subject: `Jump - ${toPrepare} ${plural(toPrepare, 'événement à préparer', 'événements à préparer')}`,
    html,
    text: textLines.join('\n'),
    summary: {
      eventsToPrepare: toPrepare,
      unresolvedSyncErrors: sync.unresolvedErrors.value,
      lastSyncAgeHours: last?.ageHours ?? null,
      failedPdfJobs,
      overdueDeletionRequests: overdueDeletions,
    },
  };
}

/** Login emails of every admin-role account. */
export async function adminDigestRecipients(): Promise<string[]> {
  const admins = await prisma.bauth_user.findMany({
    where: { staffProfile: { staffRole: 'admin' } },
    select: { email: true },
  });
  return admins.map((a) => a.email).filter((email): email is string => !!email);
}

export type AdminDigestSendResult = {
  sent: number;
  failed: number;
  recipients: number;
  summary: AdminDigest['summary'];
};

export async function sendAdminDigest(): Promise<AdminDigestSendResult> {
  const [digest, recipients] = await Promise.all([
    buildAdminDigest(),
    adminDigestRecipients(),
  ]);

  let sent = 0;
  let failed = 0;
  // One message per admin rather than a single multi-recipient send: on a
  // trapped environment the dev-redirect resolves per send, and a shared "to"
  // would also expose the whole admin list in every header.
  for (const to of recipients) {
    const result = await sendEmail({
      from: MAIL_FROM,
      to,
      subject: digest.subject,
      html: digest.html,
      text: digest.text,
    });
    if (result.ok) sent++;
    else {
      failed++;
      console.error(`[adminDigest] send failed for ${to}: ${result.message}`);
    }
  }

  return {
    sent,
    failed,
    recipients: recipients.length,
    summary: digest.summary,
  };
}
