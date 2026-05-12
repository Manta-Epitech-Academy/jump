import type {
  Broadcast,
  BroadcastAudience,
  BroadcastChannel,
  BroadcastSourceFilter,
} from '@prisma/client';
import { prisma } from '$lib/server/db';
import type { BroadcastFilters } from '$lib/domain/broadcasts';
import { rewriteHtmlLinks, rewriteSmsLinks } from './linkRewriter';
import {
  substituteVariables,
  type VariableContext,
} from '$lib/domain/broadcastVariables';
import { renderBroadcastMail } from '$lib/domain/broadcastMarkdown';
import { resolveRecipients } from './recipients';
import { getMailProvider } from './providers/mail';
import { getSmsProvider } from './providers/sms';
import type { SendOutcome } from './providers/types';
import {
  mintFastloginToken,
  buildFastloginLink,
  mintTalentOtp,
} from './personalization';

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
  const broadcast = await prisma.broadcast.findUniqueOrThrow({
    where: { id: broadcastId },
    select: {
      id: true,
      channel: true,
      subjectSnapshot: true,
      bodySnapshot: true,
      eventId: true,
      event: { select: { titre: true } },
    },
  });

  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: { status: 'sending' },
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
        talent: { select: { id: true, email: true, prenom: true, nom: true } },
        parentOf: { select: { parentPrenom: true, parentNom: true } },
        staffUser: { select: { name: true } },
        broadcast: {
          select: {
            campus: { select: { name: true } },
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
          select: { id: true; email: true; prenom: true; nom: true };
        };
        parentOf: { select: { parentPrenom: true; parentNom: true } };
        staffUser: { select: { name: true } };
        broadcast: { select: { campus: { select: { name: true } } } };
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
  event: { titre: string } | null;
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
  personal: { fastloginLink: string | null; otpCode: string | null },
): { to: string; subject: string; html: string } | null {
  if (!recipient.recipientEmail) return null;
  const ctx = buildContext(recipient, broadcast, personal);
  const subject = broadcast.subjectSnapshot
    ? substituteVariables(broadcast.subjectSnapshot, ctx)
    : '';
  const bodyWithVars = substituteVariables(broadcast.bodySnapshot, ctx);
  const html = rewriteHtmlLinks(
    renderBroadcastMail(bodyWithVars),
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
        outcome = await getSmsProvider().sendSms({
          to: recipient.recipientPhone,
          body,
        });
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
  personal: { fastloginLink: string | null; otpCode: string | null },
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

  return {
    prenom,
    nom,
    email: recipient.recipientEmail,
    phone: recipient.recipientPhone,
    campus: recipient.broadcast.campus?.name ?? '',
    event_name: broadcast.event?.titre ?? null,
    fastlogin_link: personal.fastloginLink,
    otp_code: personal.otpCode,
  };
}

/**
 * Whether the template references `{{fastlogin_link}}` / `{{otp_code}}`.
 * Used to skip the cost of minting secrets we'd never inject — JWT signing
 * is cheap, but `mintTalentOtp` writes a row to `bauth_verification` per
 * call which adds up at 200 recipients.
 */
function templateUses(
  broadcast: BroadcastForSend,
  token: 'fastlogin_link' | 'otp_code',
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

/**
 * Mint per-recipient secrets up-front. Only talents get them; parents and
 * staff have null and the template-side substitution renders empty.
 * Failures are isolated (we don't tank a 200-recipient batch because one
 * OTP write hit a transient DB error) — that recipient just gets a null
 * for the failed variable.
 */
async function buildPersonalization(
  recipient: RecipientWithRelations,
  broadcast: BroadcastForSend,
  needs: { fastlogin: boolean; otp: boolean },
): Promise<{ fastloginLink: string | null; otpCode: string | null }> {
  const talent = recipient.talent;
  if (!talent) return { fastloginLink: null, otpCode: null };
  const email = talent.email ?? recipient.recipientEmail;
  if (!email) return { fastloginLink: null, otpCode: null };

  const [fastloginLink, otpCode] = await Promise.all([
    needs.fastlogin
      ? mintFastloginToken({
          email,
          talentId: talent.id,
          recipientId: recipient.id,
        })
          .then(buildFastloginLink)
          .catch((err) => {
            console.error(
              `[broadcast] fastlogin mint failed for ${email}:`,
              err,
            );
            return null;
          })
      : Promise.resolve(null),
    needs.otp
      ? mintTalentOtp(email).catch((err) => {
          console.error(`[broadcast] otp mint failed for ${email}:`, err);
          return null;
        })
      : Promise.resolve(null),
  ]);

  return { fastloginLink, otpCode };
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
