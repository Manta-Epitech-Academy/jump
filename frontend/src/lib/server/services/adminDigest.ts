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
 *
 * Every actionable figure links straight to the admin page that acts on it. A
 * recipient who isn't logged in yet still lands there: the staff login guard
 * carries the target through `?redirect=` and replays it after Microsoft OAuth
 * (`$lib/server/auth/loginRedirect.ts`), so the link works whether the click
 * happens before or after signing in.
 *
 * Same branded shell as every other Jump mail (`$lib/domain/emailBrandShell`),
 * wrapped as a full HTML document: a bare fragment scores Gmail/Outlook's
 * auto-generated-spam heuristic, which is exactly the defect the shared shell
 * exists to avoid.
 */

import { env } from '$env/dynamic/private';
import { prisma } from '$lib/server/db';
import { sendEmail, MAIL_FROM } from '$lib/server/email';
import { getUnconfiguredEvents } from '$lib/server/services/adminStats/unconfiguredEvents';
import { getSyncHealth } from '$lib/server/services/adminStats/syncHealth';
import {
  getPdfJobsHealth,
  getAccountDeletionQueue,
} from '$lib/server/services/adminStats/opsQueues';
import {
  EPI_BLUE,
  INK,
  SUBTLE,
  BORDER,
  PANEL_BG,
  shellOpen,
  shellClose,
  wrapEmailDocument,
} from '$lib/domain/emailBrandShell';
import { escapeHtml } from '$lib/domain/htmlEscape';

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

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const link = (href: string, label: string) =>
  `<a href="${href}" style="color:${EPI_BLUE};text-decoration:underline;">${label}</a>`;

/**
 * Build the digest. `baseUrl` (pass `env.ORIGIN`) turns every page link and the
 * shell's logo into an absolute URL, the way a recipient's mail client needs it;
 * the default empty string is only for tests, which assert on the relative path.
 */
export async function buildAdminDigest(baseUrl = ''): Promise<AdminDigest> {
  const [events, sync, pdfJobs, deletions] = await Promise.all([
    getUnconfiguredEvents(),
    getSyncHealth(),
    getPdfJobsHealth(),
    getAccountDeletionQueue(),
  ]);

  const eventsUrl = `${baseUrl}/staff/admin/events`;
  const dashboardUrl = `${baseUrl}/staff/admin`;
  const syncErrorsUrl = `${baseUrl}/staff/admin/sync-errors`;
  const onboardingPdfsUrl = `${baseUrl}/staff/admin/onboarding-pdfs`;
  const accountDeletionsUrl = `${baseUrl}/staff/admin/account-deletions`;

  const toPrepare = events.toPrepare.value;
  const listed = events.events.value.slice(0, LISTED_EVENTS);
  // Counted off the total, NOT off the returned list: that list is itself capped
  // at UNCONFIGURED_EVENTS_LIMIT, so subtracting from its length made the mail
  // contradict its own lead ("200 événements demandent une action" above a table
  // of 15 plus "et 85 autres") as soon as the cap was reached.
  const remaining = toPrepare - listed.length;
  const last = sync.lastSync.value;
  const unresolvedErrors = sync.unresolvedErrors.value;

  const eventRows = listed
    .map(
      (e) => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid ${BORDER};">${escapeHtml(e.titre)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid ${BORDER};">${escapeHtml(e.campus)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid ${BORDER};">${escapeHtml(e.dateLabel)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid ${BORDER};">${escapeHtml(e.missing.join(', ') || e.configStateLabel)}</td>
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
        ${link(eventsUrl, 'Voir sur la page Événements')}.
      </p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;margin:0 0 8px;">
        <thead>
          <tr style="text-align:left;background:${PANEL_BG};">
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
          ? `<p style="margin:0 0 16px;font-size:13px;color:${SUBTLE};">Et ${remaining} autre${remaining > 1 ? 's' : ''}.</p>`
          : ''
      }`;

  // Two lines, because they answer two questions and only one of them is ever
  // reassuring. `last === null` means the sync has NEVER run, worse than merely
  // stale, so it must not sit next to "aucune erreur en attente": that zero is
  // true here only because no sync ran to produce an error, and pairing them
  // reads as reassurance for the worst possible state.
  const syncStateLine = !last
    ? `Aucune synchronisation Salesforce n'a jamais été enregistrée : à vérifier en priorité sur ${link(dashboardUrl, 'le tableau de bord admin')}.`
    : last.stale
      ? `Dernière synchronisation Salesforce il y a <strong>${last.ageHours} h</strong> : à vérifier sur ${link(dashboardUrl, 'le tableau de bord admin')}.`
      : `Dernière synchronisation Salesforce il y a <strong>${last.ageHours} h</strong>.`;

  const syncErrorsLine =
    unresolvedErrors > 0
      ? `${last ? '' : 'Pourtant, '}<strong>${unresolvedErrors}</strong> ${plural(unresolvedErrors, 'erreur', 'erreurs')} de synchronisation ${plural(unresolvedErrors, 'est', 'sont')} à arbitrer sur ${link(syncErrorsUrl, 'la page dédiée')}.`
      : last
        ? 'Aucune erreur en attente.'
        : '';

  const syncSection = `
    <p style="margin:0 0 8px;">
      ${syncStateLine}
      ${syncErrorsLine}
    </p>`;

  // Two queues nothing else chases. A failed document means a talent has no
  // règlement to download; an overdue erasure request is a legal exposure with
  // a clock on it, and until now it only surfaced if somebody opened the page.
  const failedPdfJobs = pdfJobs.failed.value;
  const overdueDeletions = deletions.overdue.value;
  const pendingDeletions = deletions.pending.value;
  const queueLines = [
    failedPdfJobs > 0
      ? `<strong>${failedPdfJobs}</strong> ${plural(failedPdfJobs, 'génération de document en échec', 'générations de document en échec')} : tant qu'${plural(failedPdfJobs, "elle n'est pas relancée", 'elles ne sont pas relancées')}, ${plural(failedPdfJobs, "le talent concerné n'a", "les talents concernés n'ont")} pas de document à télécharger. ${link(onboardingPdfsUrl, 'Voir la file')}.`
      : '',
    overdueDeletions > 0
      ? `<strong>${overdueDeletions}</strong> ${plural(overdueDeletions, 'demande de suppression de compte a dépassé', 'demandes de suppression de compte ont dépassé')} le délai que nous nous imposons. ${link(accountDeletionsUrl, 'Voir les demandes')}.`
      : pendingDeletions > 0
        ? `${pendingDeletions} ${plural(pendingDeletions, 'demande de suppression de compte est en attente', 'demandes de suppression de compte sont en attente')}, encore dans les délais.`
        : '',
  ].filter(Boolean);

  const queueSection = queueLines.length
    ? `<ul style="margin:0 0 16px;padding-left:18px;">${queueLines.map((line) => `<li>${line}</li>`).join('')}</ul>`
    : `<p style="margin:0 0 16px;">Aucune file en attente : documents générés, aucune demande de suppression en retard.</p>`;

  const shellHtml = `
      <h1 style="font-size:20px;font-weight:700;margin:0 0 4px;color:${INK};">Point hebdomadaire</h1>
      <p style="margin:0 0 20px;color:${SUBTLE};font-size:13px;">
        Préparation des événements, files en attente et santé de la
        synchronisation Salesforce.
      </p>
      <h2 style="font-size:15px;font-weight:700;margin:0 0 8px;color:${INK};">Événements à préparer</h2>
      ${eventsSection}
      <h2 style="font-size:15px;font-weight:700;margin:0 0 8px;color:${INK};">Files en attente</h2>
      ${queueSection}
      <h2 style="font-size:15px;font-weight:700;margin:0 0 8px;color:${INK};">Synchronisation</h2>
      ${syncSection}
      <p style="margin:24px 0 0;color:${SUBTLE};font-size:12px;">
        Message automatique, envoyé chaque lundi aux administrateurs de Jump.
      </p>`;

  const html = wrapEmailDocument(
    `${shellOpen(baseUrl)}${shellHtml}${shellClose()}`,
    'Jump - point hebdomadaire',
  );

  const textLines = [
    'Jump - point hebdomadaire',
    '',
    `Événements à préparer : ${toPrepare}`,
    ...listed.map(
      (e) =>
        `  - ${e.titre} (${e.campus}, ${e.dateLabel}) : ${e.missing.join(', ') || e.configStateLabel}`,
    ),
    remaining > 0 ? `  ... et ${remaining} autre(s).` : '',
    toPrepare > 0 ? `  Voir : ${eventsUrl}` : '',
    '',
    failedPdfJobs > 0
      ? `Générations de document en échec (relance nécessaire) : ${failedPdfJobs}`
      : 'Générations de document en échec : 0',
    failedPdfJobs > 0 ? `  Voir : ${onboardingPdfsUrl}` : '',
    `Demandes de suppression en attente : ${pendingDeletions}${overdueDeletions > 0 ? ` (dont ${overdueDeletions} hors délai)` : ''}`,
    overdueDeletions > 0 ? `  Voir : ${accountDeletionsUrl}` : '',
    '',
    last
      ? `Dernière synchronisation Salesforce : il y a ${last.ageHours} h${last.stale ? ' (à vérifier)' : ''}.`
      : `Aucune synchronisation Salesforce n'a jamais été enregistrée (à vérifier en priorité).`,
    !last || last.stale ? `  Voir : ${dashboardUrl}` : '',
    `Erreurs de synchronisation à arbitrer : ${unresolvedErrors}`,
    unresolvedErrors > 0 ? `  Voir : ${syncErrorsUrl}` : '',
  ].filter(Boolean);

  return {
    subject: `Jump - ${toPrepare} ${plural(toPrepare, 'événement à préparer', 'événements à préparer')}`,
    html,
    text: textLines.join('\n'),
    summary: {
      eventsToPrepare: toPrepare,
      unresolvedSyncErrors: unresolvedErrors,
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
    buildAdminDigest(env.ORIGIN ?? ''),
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
