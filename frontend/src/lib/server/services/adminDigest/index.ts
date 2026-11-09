/**
 * The weekly admin digest: what needs configuring, and whether Salesforce is
 * still feeding us.
 *
 * Zero new surface. It reads exactly the same services as the curated API and the
 * MCP tools, so the figures in the PO's inbox and the figures an admin gets by
 * asking cannot disagree. If a definition changes, it changes here too, because
 * the definitions travel with the numbers.
 *
 * Recipients are the admins who were chosen for it (`receivesAdminDigest`, set
 * through `write_admin_digest_recipient`), never every admin. It used to follow
 * the role, and the role was then given to national leadership so they could read
 * the admin space: a working mail landed in their inbox without anyone deciding it
 * (#426). Only an admin account can be chosen, because every link below needs a
 * staff session; a departure (the account goes) or a demotion (the role is re-read
 * here) still stops the mail with nothing to remember. Nobody chosen means no
 * digest at all, not a fallback to every admin.
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
 * The mail is described once (`findings.ts`) and rendered twice (`render.ts`),
 * so its HTML and text parts cannot say different things.
 *
 * Same branded shell as every other Jump mail (`$lib/domain/emailBrandShell`),
 * wrapped as a full HTML document: a bare fragment scores Gmail/Outlook's
 * auto-generated-spam heuristic, which is exactly the defect the shared shell
 * exists to avoid.
 */

import { env } from '$env/dynamic/private';
import { sendEmail, MAIL_FROM } from '$lib/server/email';
import { adminDigestRecipients } from '$lib/server/services/adminStats/adminDigestRecipients';
import { getEventsConfigList } from '$lib/server/services/adminStats/eventsList';
import { getSyncHealth } from '$lib/server/services/adminStats/syncHealth';
import { getDataFreshness } from '$lib/server/services/adminStats/dataFreshness';
import {
  getPdfJobsHealth,
  getAccountDeletionQueue,
} from '$lib/server/services/adminStats/opsQueues';
import { getFeatureAdoptionGaps } from '$lib/server/services/adminStats/featureUsage';
import {
  ADOPTION_WINDOW_DAYS,
  composeDigest,
  type DigestInput,
} from './findings';
import { renderDigestHtml, renderDigestText } from './render';

export type AdminDigest = {
  subject: string;
  html: string;
  text: string;
  /** Structured counts, so the job can log what it announced. */
  summary: {
    eventsToPrepare: number;
    openSyncErrors: number;
    prunesHeldEvents: number;
    unrecognisedSfStatuses: number;
    lastSyncAgeHours: number | null;
    failedPdfJobs: number;
    overdueDeletionRequests: number;
    /** Null when the monthly cube holds no measurement for the window. */
    unusedFeatures: number | null;
    abandonedFeatures: number | null;
    singleCampusFeatures: number | null;
  };
};

/** Read every payload the digest speaks from, in parallel. */
async function readDigestInput(): Promise<DigestInput> {
  const [events, sync, freshness, pdfJobs, deletions, adoption] =
    await Promise.all([
      // The events still to prepare, soonest first: the same list
      // `config_events` answers with `state: to_prepare`.
      getEventsConfigList({}, { state: 'to_prepare' }),
      getSyncHealth(),
      getDataFreshness(),
      getPdfJobsHealth(),
      getAccountDeletionQueue(),
      // Read through the same service the API answers from, so a figure in an
      // inbox and the same figure asked over MCP cannot disagree.
      getFeatureAdoptionGaps({}, { days: ADOPTION_WINDOW_DAYS }),
    ]);
  return { events, sync, freshness, pdfJobs, deletions, adoption };
}

function summarise(input: DigestInput): AdminDigest['summary'] {
  return {
    eventsToPrepare: input.events.events.value,
    openSyncErrors: input.sync.openErrors.value,
    prunesHeldEvents: input.sync.prunesHeldEvents.value,
    unrecognisedSfStatuses: input.sync.unrecognisedStatuses.value,
    lastSyncAgeHours: input.freshness.value?.ageHours ?? null,
    failedPdfJobs: input.pdfJobs.failed.value,
    overdueDeletionRequests: input.deletions.overdue.value,
    unusedFeatures: input.adoption.aRetirer.value,
    abandonedFeatures: input.adoption.aSurveiller.value,
    singleCampusFeatures: input.adoption.aFormer.value,
  };
}

/**
 * Build the digest. `baseUrl` (pass `env.ORIGIN`) turns every page link and the
 * shell's logo into an absolute URL, the way a recipient's mail client needs it;
 * the default empty string is only for tests, which assert on the relative path.
 */
export async function buildAdminDigest(baseUrl = ''): Promise<AdminDigest> {
  const input = await readDigestInput();
  const doc = composeDigest(input);
  return {
    subject: doc.subject,
    html: renderDigestHtml(doc, baseUrl),
    text: renderDigestText(doc, baseUrl),
    summary: summarise(input),
  };
}

export type AdminDigestSendResult = {
  sent: number;
  failed: number;
  recipients: number;
  /** Null when nobody was chosen: no digest is built for nobody. */
  summary: AdminDigest['summary'] | null;
};

export async function sendAdminDigest(): Promise<AdminDigestSendResult> {
  const recipients = await adminDigestRecipients();
  if (recipients.length === 0)
    return { sent: 0, failed: 0, recipients: 0, summary: null };

  const digest = await buildAdminDigest(env.ORIGIN ?? '');

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
