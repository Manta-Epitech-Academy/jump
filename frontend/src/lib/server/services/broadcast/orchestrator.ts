import type {
  Broadcast,
  BroadcastAudience,
  BroadcastChannel,
  BroadcastSourceFilter,
} from '@prisma/client';
import { env } from '$env/dynamic/private';
import { prisma } from '$lib/server/db';
import type { BroadcastFilters } from '$lib/domain/broadcasts';
import { rewriteHtmlLinks, rewriteSmsLinks } from './linkRewriter';
import {
  substituteVariables,
  type VariableContext,
} from '$lib/domain/broadcastVariables';
import { renderBroadcastMail } from '$lib/domain/broadcastMarkdown';
import { daysUntil } from '$lib/server/services/stageContext';
import { resolveRecipients } from './recipients';
import { getMailProvider } from './providers/mail';
import { getSmsProvider } from './providers/sms';
import type { SendOutcome } from './providers/types';
import {
  mintFastloginToken,
  buildFastloginLink,
  mintParentFastloginToken,
  buildParentFastloginLink,
} from '$lib/server/auth/fastloginToken';
import { mintSigninOtp } from './personalization';
import { staffBulkDevRedirectEmails } from '$lib/server/email/dev-redirect';
import { staffBulkDevRedirectPhones } from '$lib/server/sms/dev-redirect';

export interface EnqueueBroadcastInput {
  name: string;
  templateId: string;
  campusId: string;
  audience: BroadcastAudience;
  eventId?: string | null;
  sourceBroadcastId?: string | null;
  sourceFilter?: BroadcastSourceFilter | null;
  filters?: BroadcastFilters | null;
  createdById: string;
}

export interface EnqueueResult {
  broadcastId: string;
  recipientCount: number;
}

/**
 * Create a Broadcast + N BroadcastRecipient rows in `pending` status.
 * The template body/subject are snapshotted onto the Broadcast so later
 * edits to the template don't rewrite history.
 *
 * No messages are sent here — call `processBroadcast()` after.
 */
export async function enqueueBroadcast(
  input: EnqueueBroadcastInput,
): Promise<EnqueueResult> {
  const template = await prisma.messageTemplate.findUniqueOrThrow({
    where: { id: input.templateId },
    select: { channel: true, subject: true, body: true },
  });

  const { recipients } = await resolveRecipients(
    {
      campusId: input.campusId,
      audience: input.audience,
      eventId: input.eventId,
      filters: input.filters,
      sourceBroadcastId: input.sourceBroadcastId,
      sourceFilter: input.sourceFilter,
    },
    template.channel,
  );

  const broadcast = await prisma.broadcast.create({
    data: {
      name: input.name,
      channel: template.channel,
      templateId: input.templateId,
      campusId: input.campusId,
      audience: input.audience,
      eventId: input.eventId || null,
      sourceBroadcastId: input.sourceBroadcastId || null,
      sourceFilter: input.sourceFilter ?? null,
      filters: (input.filters ?? null) as never,
      subjectSnapshot: template.subject,
      bodySnapshot: template.body,
      status: 'queued',
      createdById: input.createdById,
    },
    select: { id: true },
  });

  if (recipients.length > 0) {
    await prisma.broadcastRecipient.createMany({
      data: recipients.map((r) => ({
        broadcastId: broadcast.id,
        talentId: r.talentId,
        staffUserId: r.staffUserId,
        parentOfTalentId: r.parentOfTalentId,
        recipientEmail: r.email,
        recipientPhone: r.phone,
        status: 'pending' as const,
      })),
    });
  }

  return { broadcastId: broadcast.id, recipientCount: recipients.length };
}

/**
 * Process all pending recipients for a single broadcast.
 *
 * For each recipient:
 *   1. Build per-recipient variable context
 *   2. Substitute variables in the snapshot body/subject
 *   3. Rewrite links with the recipient's tracking id
 *   4. Send via mail or SMS provider
 *   5. Update the recipient row (status, sentAt, errorMessage)
 *
 * After draining, set the broadcast status based on outcomes.
 */
export async function processBroadcast(broadcastId: string): Promise<void> {
  // Atomic claim. Only one caller can flip `queued → sending` (or take over
  // a stuck `sending` row) for a given broadcast — the others see count=0
  // and bail. Without this, the fire-and-forget call from the create action
  // and a concurrent cron tick (or two cron ticks) would both page the same
  // `pending` recipients and double-send.
  const stuckBefore = new Date(Date.now() - SENDING_STUCK_TIMEOUT_MS);
  const claim = await prisma.broadcast.updateMany({
    where: {
      id: broadcastId,
      OR: [
        { status: 'queued' },
        { status: 'sending', updatedAt: { lt: stuckBefore } },
      ],
    },
    data: { status: 'sending', updatedAt: new Date() },
  });
  if (claim.count === 0) return;

  const broadcast = await prisma.broadcast.findUniqueOrThrow({
    where: { id: broadcastId },
    select: {
      id: true,
      channel: true,
      subjectSnapshot: true,
      bodySnapshot: true,
      eventId: true,
      event: { select: { titre: true, date: true } },
      // The staff member who enqueued this broadcast. On dev/staging their
      // configured dev-redirect inbox (or login email) is where trapped mail
      // copies land (see `sendMailBatch`), so each tester only sees their own
      // broadcasts. Resolved from the row, not the request context, because the
      // send can run in the worker after the request that enqueued it is gone.
      createdBy: {
        select: {
          email: true,
          staffProfile: {
            select: { devRedirectEmails: true, devRedirectPhones: true },
          },
        },
      },
    },
  });

  // Stream recipients in pages to keep memory bounded for large broadcasts.
  // PAGE is also the upstream batch-API cap for mail (Resend = 100), so a
  // mail page maps to one API call.
  const PAGE = 100;
  while (true) {
    const retryCutoff = new Date(Date.now() - RETRY_COOLDOWN_MS);
    const batch = await prisma.broadcastRecipient.findMany({
      where: {
        broadcastId,
        status: 'pending',
        // Eligibility: never tried OR cooled down past the backoff window.
        // Rows in cooldown are left for the worker's next tick to retry.
        OR: [{ lastTriedAt: null }, { lastTriedAt: { lt: retryCutoff } }],
      },
      take: PAGE,
      include: {
        talent: {
          select: {
            id: true,
            email: true,
            prenom: true,
            nom: true,
          },
        },
        parentOf: {
          select: {
            id: true,
            parentEmail: true,
            parentPrenom: true,
            parentNom: true,
            prenom: true,
            nom: true,
          },
        },
        staffUser: { select: { name: true } },
        broadcast: {
          select: {
            campus: { select: { name: true, contactEmail: true } },
          },
        },
      },
    });
    if (batch.length === 0) break;

    if (broadcast.channel === 'mail') {
      await sendMailBatch(batch, broadcast);
    } else {
      await sendSmsSerial(batch, broadcast);
    }

    // Checkpoint: bump `updatedAt` so the stuck-broadcast recovery in
    // `processNextQueuedBroadcast` knows this loop is still alive. If the
    // process dies between two pages, the worker will pick up the broadcast
    // on the next tick and resume from the remaining `pending` recipients.
    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { updatedAt: new Date() },
    });
  }

  // Final tally from DB so it covers rows persisted across earlier runs
  // (resumed broadcasts). If any rows are still `pending`, the broadcast
  // has retry candidates in cooldown — leave at `sending`, the worker will
  // pick it back up after the stuck timeout (or after the cooldown elapses,
  // whichever fires first, given the heartbeat goes stale once we return).
  const counts = await prisma.broadcastRecipient.groupBy({
    by: ['status'],
    where: { broadcastId },
    _count: { _all: true },
  });
  const tally = { pending: 0, sent: 0, failed: 0 };
  for (const c of counts) tally[c.status] = c._count._all;

  if (tally.pending > 0) return; // not finalized yet — retry candidates remain

  const finalStatus =
    tally.failed === 0
      ? 'sent'
      : tally.sent === 0
        ? 'failed'
        : 'partial_failed';

  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: { status: finalStatus },
  });
}

type RecipientWithRelations = Awaited<
  ReturnType<
    typeof prisma.broadcastRecipient.findMany<{
      include: {
        talent: {
          select: {
            id: true;
            email: true;
            prenom: true;
            nom: true;
          };
        };
        parentOf: {
          select: {
            id: true;
            parentEmail: true;
            parentPrenom: true;
            parentNom: true;
            prenom: true;
            nom: true;
          };
        };
        staffUser: { select: { name: true } };
        broadcast: {
          select: {
            campus: { select: { name: true; contactEmail: true } };
          };
        };
      };
    }>
  >
>[number];

type BroadcastForSend = {
  id: string;
  channel: BroadcastChannel;
  subjectSnapshot: string | null;
  bodySnapshot: string;
  eventId: string | null;
  event: { titre: string; date: Date } | null;
  createdBy: {
    email: string;
    staffProfile: {
      devRedirectEmails: string[];
      devRedirectPhones: string[];
    } | null;
  };
};

/**
 * Build the per-recipient mail payload: subject + body with variable
 * substitution, branded HTML render, and tracking_id link rewrite.
 * Returns null if the recipient is unsendable (no email address) — caller
 * marks it failed without burning a slot in the upstream batch.
 */
function buildMailMessage(
  recipient: RecipientWithRelations,
  broadcast: BroadcastForSend,
  personal: Personalization,
): { to: string; subject: string; html: string } | null {
  if (!recipient.recipientEmail) return null;
  const ctx = buildContext(recipient, broadcast, personal);
  const subject = broadcast.subjectSnapshot
    ? substituteVariables(broadcast.subjectSnapshot, ctx)
    : '';
  const bodyWithVars = substituteVariables(broadcast.bodySnapshot, ctx);
  const html = rewriteHtmlLinks(
    renderBroadcastMail(bodyWithVars, env.ORIGIN ?? ''),
    recipient.id,
  );
  return { to: recipient.recipientEmail, subject, html };
}

/**
 * Mail path: render every recipient's payload, ship them in one batch API
 * call (Resend caps at 100 — matches PAGE), then persist per-recipient
 * status. Recipients with no email are marked failed without consuming a
 * batch slot.
 */
async function sendMailBatch(
  recipients: RecipientWithRelations[],
  broadcast: BroadcastForSend,
): Promise<SendOutcome[]> {
  const needs = {
    fastlogin: templateUses(broadcast, 'fastlogin_link'),
    parentFastlogin: templateUses(broadcast, 'parent_fastlogin_link'),
    otp: templateUses(broadcast, 'otp_code'),
  };
  // Mint per-recipient secrets concurrently — JWT signing is in-memory,
  // OTP minting is one DB insert per talent. Cap concurrency to avoid
  // saturating the Prisma connection pool when needs.otp is true. Errors
  // are swallowed inside buildPersonalization so one bad mint doesn't fail
  // the whole batch.
  const personalizations = await mapWithConcurrency(
    recipients,
    PERSONALIZATION_CONCURRENCY,
    (r) => buildPersonalization(r, broadcast, needs),
  );

  const sendable: {
    recipient: RecipientWithRelations;
    msg: NonNullable<ReturnType<typeof buildMailMessage>>;
  }[] = [];
  const outcomeById = new Map<string, SendOutcome>();

  recipients.forEach((recipient, i) => {
    const msg = buildMailMessage(recipient, broadcast, personalizations[i]);
    if (!msg) {
      outcomeById.set(recipient.id, {
        ok: false,
        message: 'recipient has no email',
        retryable: false,
      });
    } else {
      sendable.push({ recipient, msg });
    }
  });

  if (sendable.length > 0) {
    let providerOutcomes: SendOutcome[];
    try {
      providerOutcomes = await getMailProvider().sendMailBatch(
        sendable.map((s) => s.msg),
        // On a trapped env, route copies to the broadcast's creator instead of
        // the shared debug list; a no-op in prod. Prefer their configured
        // dev-redirect inbox, falling back to their login email. `sendSmsSerial`
        // does the same with the creator's configured phones (no login-phone
        // fallback — staff accounts carry no login phone).
        {
          devRedirectTo: staffBulkDevRedirectEmails(
            broadcast.createdBy.staffProfile?.devRedirectEmails,
            broadcast.createdBy.email,
          ),
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Thrown out of sendMailBatch = something went wrong before the
      // SDK could respond (network, init). Treat as transient.
      providerOutcomes = sendable.map(() => ({
        ok: false,
        message,
        retryable: true,
      }));
    }
    sendable.forEach(({ recipient }, i) => {
      outcomeById.set(recipient.id, providerOutcomes[i]);
    });
  }

  await persistOutcomes(recipients, outcomeById);
  return recipients.map((r) => outcomeById.get(r.id)!);
}

/**
 * SMS path: providers aren't batched (the null stub doesn't need it; a
 * future Twilio/OVH integration would expose its own batch). Send one at a
 * time and persist as we go.
 */
async function sendSmsSerial(
  recipients: RecipientWithRelations[],
  broadcast: BroadcastForSend,
): Promise<SendOutcome[]> {
  const needs = {
    fastlogin: templateUses(broadcast, 'fastlogin_link'),
    parentFastlogin: templateUses(broadcast, 'parent_fastlogin_link'),
    otp: templateUses(broadcast, 'otp_code'),
  };
  const outcomeById = new Map<string, SendOutcome>();
  for (const recipient of recipients) {
    let outcome: SendOutcome;
    if (!recipient.recipientPhone) {
      outcome = {
        ok: false,
        message: 'recipient has no phone',
        retryable: false,
      };
    } else {
      const personal = await buildPersonalization(recipient, broadcast, needs);
      const ctx = buildContext(recipient, broadcast, personal);
      const bodyWithVars = substituteVariables(broadcast.bodySnapshot, ctx);
      const body = rewriteSmsLinks(bodyWithVars, recipient.id);
      try {
        outcome = await getSmsProvider().sendSms(
          {
            to: recipient.recipientPhone,
            body,
          },
          // Mirror the mail path: on a trapped env route copies to the
          // creator's configured phones (resolved from the row, since this can
          // run in the worker). No login-phone fallback — an unconfigured
          // creator yields `[]`, so the façade falls back to SMS_DEV_RECIPIENTS
          // or drops. A no-op in prod.
          {
            devRedirectTo: staffBulkDevRedirectPhones(
              broadcast.createdBy.staffProfile?.devRedirectPhones,
            ),
          },
        );
      } catch (err) {
        outcome = {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
          retryable: true,
        };
      }
    }
    outcomeById.set(recipient.id, outcome);
  }
  await persistOutcomes(recipients, outcomeById);
  return recipients.map((r) => outcomeById.get(r.id)!);
}

async function persistOutcomes(
  recipients: RecipientWithRelations[],
  outcomeById: Map<string, SendOutcome>,
): Promise<void> {
  const now = new Date();
  const succeededIds: string[] = [];
  // Per-row update for retries/failures because each one carries its own
  // message + retryCount. updateMany only works for the homogeneous "sent"
  // bucket below.
  const updates: Promise<unknown>[] = [];

  for (const recipient of recipients) {
    const outcome = outcomeById.get(recipient.id);
    if (!outcome) continue;
    if (outcome.ok) {
      succeededIds.push(recipient.id);
      continue;
    }
    const willRetry =
      outcome.retryable && recipient.retryCount + 1 < MAX_RETRIES;
    if (willRetry) {
      // Stay `pending`, bump retryCount + lastTriedAt. The page query
      // gates on `lastTriedAt < now - RETRY_COOLDOWN_MS` so this row sits
      // out for the cooldown window before being picked up again.
      updates.push(
        prisma.broadcastRecipient.update({
          where: { id: recipient.id },
          data: {
            retryCount: { increment: 1 },
            lastTriedAt: now,
            errorMessage: outcome.message,
          },
        }),
      );
    } else {
      updates.push(
        prisma.broadcastRecipient.update({
          where: { id: recipient.id },
          data: {
            status: 'failed',
            retryCount: { increment: 1 },
            lastTriedAt: now,
            errorMessage: outcome.message,
          },
        }),
      );
    }
  }

  await Promise.all([
    succeededIds.length > 0
      ? prisma.broadcastRecipient.updateMany({
          where: { id: { in: succeededIds } },
          data: {
            status: 'sent',
            sentAt: now,
            lastTriedAt: now,
            errorMessage: null,
          },
        })
      : Promise.resolve(),
    ...updates,
  ]);
}

function buildContext(
  recipient: RecipientWithRelations,
  broadcast: BroadcastForSend,
  personal: Personalization,
): VariableContext {
  let prenom = '';
  let nom = '';
  if (recipient.talent) {
    prenom = recipient.talent.prenom;
    nom = recipient.talent.nom;
  } else if (recipient.parentOf) {
    prenom = recipient.parentOf.parentPrenom ?? '';
    nom = recipient.parentOf.parentNom ?? '';
  } else if (recipient.staffUser?.name) {
    const [first, ...rest] = recipient.staffUser.name.split(' ');
    prenom = first ?? '';
    nom = rest.join(' ');
  }

  // For broadcasts with audience=parent, the parent_* variables surface
  // the parent's own identity (already in prenom/nom) and child_* the
  // talent they're tied to. For talent recipients, parent_* mirror the
  // talent's parent info if present. login_link is null here — broadcasts
  // use fastlogin_link instead (the JWT carries the session).
  const isParentRecipient = !!recipient.parentOf;
  return {
    prenom,
    nom,
    email: recipient.recipientEmail,
    phone: recipient.recipientPhone,
    campus: recipient.broadcast.campus?.name ?? '',
    email_contact_campus: recipient.broadcast.campus?.contactEmail ?? null,
    event_name: broadcast.event?.titre ?? null,
    // Countdown to the linked event for {{jours_restants}} (e.g. a "le stage
    // commence dans X jours" broadcast). Null for event-less broadcasts, like
    // the other contextual tokens.
    jours_restants: broadcast.event?.date
      ? String(daysUntil(broadcast.event.date))
      : null,
    fastlogin_link: personal.fastloginLink,
    parent_fastlogin_link: personal.parentFastloginLink,
    otp_code: personal.otpCode,
    parent_prenom: isParentRecipient
      ? (recipient.parentOf?.parentPrenom ?? null)
      : null,
    parent_nom: isParentRecipient
      ? (recipient.parentOf?.parentNom ?? null)
      : null,
    child_prenom: isParentRecipient
      ? (recipient.parentOf?.prenom ?? null)
      : null,
    child_nom: isParentRecipient ? (recipient.parentOf?.nom ?? null) : null,
    login_link: null,
    // Only set on account-deletion refusal mails, never in broadcasts.
    deletion_reason: null,
  };
}

/**
 * Whether the template references `{{fastlogin_link}}` / `{{otp_code}}` /
 * `{{parent_fastlogin_link}}`. Used to skip the cost of minting secrets we'd
 * never inject — JWT signing is cheap, but `mintSigninOtp` writes a row to
 * `bauth_verification` per call which adds up at 200 recipients.
 */
function templateUses(
  broadcast: BroadcastForSend,
  token: 'fastlogin_link' | 'parent_fastlogin_link' | 'otp_code',
): boolean {
  const needle = `{{${token}}}`;
  return (
    broadcast.bodySnapshot.includes(needle) ||
    (broadcast.subjectSnapshot?.includes(needle) ?? false)
  );
}

/**
 * Cap on concurrent personalization writes per page. OTP minting writes to
 * `bauth_verification` once per recipient; firing all 100 in parallel
 * saturates the Prisma connection pool (~10 by default) and stalls other
 * requests. Limiting to 10 keeps the loop fast without ddos-ing ourselves.
 */
const PERSONALIZATION_CONCURRENCY = 10;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        results[i] = await fn(items[i], i);
      }
    })(),
  );
  await Promise.all(workers);
  return results;
}

type Personalization = {
  fastloginLink: string | null;
  parentFastloginLink: string | null;
  otpCode: string | null;
};
const EMPTY_PERSONALIZATION: Personalization = {
  fastloginLink: null,
  parentFastloginLink: null,
  otpCode: null,
};

/**
 * Mint per-recipient login secrets up-front, each scoped to the recipient's
 * *own* account. A recipient is exactly one of talent / parent / staff (see
 * `resolveRecipients`):
 *
 *   - talent → `fastloginLink` (talent magic link) + `otpCode`
 *   - parent → `parentFastloginLink` (parent magic link) + `otpCode`
 *   - staff  → nothing (they log in via Microsoft OAuth)
 *
 * The two link kinds are deliberately never crossed. Minting a parent link
 * for a talent recipient would drop a live parent session into the student's
 * own inbox, letting them sign in as their parent and self-sign image-rights
 * consent — so the parent link only mints when the recipient *is* the parent.
 *
 * Failures are isolated so one bad mint doesn't tank a 200-recipient batch —
 * that recipient just gets a null for the failed variable.
 */
async function buildPersonalization(
  recipient: RecipientWithRelations,
  broadcast: BroadcastForSend,
  needs: { fastlogin: boolean; parentFastlogin: boolean; otp: boolean },
): Promise<Personalization> {
  const talent = recipient.talent;
  const parentOf = recipient.parentOf;

  // The email of whichever account this mail signs into. Falls back to the
  // stored recipient address (set from the same source at resolve time).
  const talentEmail = talent
    ? (talent.email ?? recipient.recipientEmail)
    : null;
  const parentEmail = parentOf
    ? (parentOf.parentEmail ?? recipient.recipientEmail)
    : null;
  const ownEmail = talentEmail ?? parentEmail;

  if (!ownEmail) return EMPTY_PERSONALIZATION; // staff, or no usable address

  const [fastloginLink, parentFastloginLink, otpCode] = await Promise.all([
    needs.fastlogin && talent && talentEmail
      ? mintFastloginToken({
          email: talentEmail,
          talentId: talent.id,
          recipientId: recipient.id,
        })
          .then(buildFastloginLink)
          .catch(logMintFailure('fastlogin', talentEmail))
      : Promise.resolve(null),
    needs.parentFastlogin && parentOf && parentEmail
      ? mintParentFastloginToken({
          email: parentEmail,
          talentId: parentOf.id,
          recipientId: recipient.id,
        })
          .then(buildParentFastloginLink)
          .catch(logMintFailure('parent fastlogin', parentEmail))
      : Promise.resolve(null),
    needs.otp
      ? mintSigninOtp(ownEmail).catch(logMintFailure('otp', ownEmail))
      : Promise.resolve(null),
  ]);

  return { fastloginLink, parentFastloginLink, otpCode };
}

/**
 * Swallow a per-recipient mint failure: log it with context and resolve to
 * null so the batch carries on and that recipient's variable renders empty.
 */
function logMintFailure(kind: string, email: string) {
  return (err: unknown): null => {
    // nosemgrep: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
    console.error(`[broadcast] ${kind} mint failed for ${email}:`, err);
    return null;
  };
}

/**
 * How long a broadcast can stay in `sending` before the worker considers
 * it stuck (process crashed / restarted mid-send) and resumes it. The
 * orchestrator's PAGE-by-PAGE loop checkpoints `updatedAt` on every page,
 * so anything older than this means the in-process loop is gone.
 */
const SENDING_STUCK_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Max number of send attempts per recipient before giving up. Includes the
 * initial attempt — so MAX_RETRIES=3 means up to 2 retries after the first
 * failure. Tuned conservatively to avoid burning the Resend quota on
 * persistent (mis-classified-permanent) errors.
 */
const MAX_RETRIES = 3;

/**
 * Cooldown between a failed attempt and its retry. The page query skips
 * rows whose `lastTriedAt` is more recent than `now - cooldown`. Matched
 * roughly to `SENDING_STUCK_TIMEOUT_MS` so the worker's next tick (after
 * stuck-pickup) finds the row eligible.
 */
const RETRY_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Process the next broadcast that needs work:
 *   - `queued`: never started, run it now.
 *   - `sending` with a stale heartbeat (`updatedAt < stuck cutoff`): the
 *     owning process is gone, resume it.
 *
 * Recipients already marked `sent` or beyond `MAX_RETRIES` are skipped by
 * the page query, so resumption is idempotent — never double-sends.
 *
 * Note: a `sending` broadcast with retry candidates still in cooldown but
 * a fresh heartbeat (`updatedAt` recent because the loop just exited)
 * waits out the stuck cutoff before being picked up. That gives the retry
 * cooldown room to elapse. With `RETRY_COOLDOWN_MS=5min` and
 * `SENDING_STUCK_TIMEOUT_MS=10min`, retries land on the next-next tick.
 *
 * Designed to be called periodically by a worker.
 */
export async function processNextQueuedBroadcast(): Promise<string | null> {
  const stuckBefore = new Date(Date.now() - SENDING_STUCK_TIMEOUT_MS);
  const next = await prisma.broadcast.findFirst({
    where: {
      OR: [
        { status: 'queued' },
        { status: 'sending', updatedAt: { lt: stuckBefore } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!next) return null;
  await processBroadcast(next.id);
  return next.id;
}
