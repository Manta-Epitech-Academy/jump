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

  let sent = 0;
  let failed = 0;

  // Stream recipients in pages to keep memory bounded for large broadcasts.
  const PAGE = 100;
  while (true) {
    const batch = await prisma.broadcastRecipient.findMany({
      where: { broadcastId, status: 'pending' },
      take: PAGE,
      include: {
        talent: { select: { prenom: true, nom: true } },
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

    for (const recipient of batch) {
      const outcome = await sendOne(recipient, broadcast);
      if (outcome.ok) sent++;
      else failed++;
    }
  }

  const finalStatus =
    failed === 0 ? 'sent' : sent === 0 ? 'failed' : 'partial_failed';

  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: { status: finalStatus },
  });
}

type RecipientWithRelations = Awaited<
  ReturnType<
    typeof prisma.broadcastRecipient.findMany<{
      include: {
        talent: { select: { prenom: true; nom: true } };
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

async function sendOne(
  recipient: RecipientWithRelations,
  broadcast: BroadcastForSend,
): Promise<SendOutcome> {
  const ctx = buildContext(recipient, broadcast);

  const subject = broadcast.subjectSnapshot
    ? substituteVariables(broadcast.subjectSnapshot, ctx)
    : '';
  // bodySnapshot is markdown for mail, plain text for SMS.
  // For mail: substitute vars in markdown → render to branded HTML → rewrite
  // links with tracking_id. For SMS: substitute → rewrite URL tracking inline.
  const bodyWithVars = substituteVariables(broadcast.bodySnapshot, ctx);
  const body =
    broadcast.channel === 'mail'
      ? rewriteHtmlLinks(renderBroadcastMail(bodyWithVars), recipient.id)
      : rewriteSmsLinks(bodyWithVars, recipient.id);

  let outcome: SendOutcome;
  try {
    if (broadcast.channel === 'mail') {
      if (!recipient.recipientEmail) {
        outcome = { ok: false, message: 'recipient has no email' };
      } else {
        outcome = await getMailProvider().sendMail({
          to: recipient.recipientEmail,
          subject,
          html: body,
        });
      }
    } else {
      if (!recipient.recipientPhone) {
        outcome = { ok: false, message: 'recipient has no phone' };
      } else {
        outcome = await getSmsProvider().sendSms({
          to: recipient.recipientPhone,
          body,
        });
      }
    }
  } catch (err) {
    outcome = {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  await prisma.broadcastRecipient.update({
    where: { id: recipient.id },
    data: outcome.ok
      ? { status: 'sent', sentAt: new Date(), errorMessage: null }
      : { status: 'failed', errorMessage: outcome.message },
  });

  return outcome;
}

function buildContext(
  recipient: RecipientWithRelations,
  broadcast: BroadcastForSend,
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
    // V1: not generated. CDC §11 (TTL & flow TBD). Renders as empty.
    fastlogin_link: null,
    otp_code: null,
  };
}

/**
 * Process the next broadcast that's in `queued` status. Returns null if
 * nothing is queued. Designed to be called periodically by a worker.
 */
export async function processNextQueuedBroadcast(): Promise<string | null> {
  const next = await prisma.broadcast.findFirst({
    where: { status: 'queued' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!next) return null;
  await processBroadcast(next.id);
  return next.id;
}
