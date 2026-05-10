/**
 * Email backend — emits iCalendar `METHOD:REQUEST` invites (and
 * `METHOD:CANCEL` on removal) to the staff member's mailbox via Resend.
 * Outlook / Apple Mail / Gmail all add the event to the user's calendar
 * on accept, and merge subsequent updates by stable UID + bumped SEQUENCE.
 *
 * Picked over the Graph backend when the Microsoft tenant won't grant
 * `Calendars.ReadWrite` (admin-consent flow). No OAuth scope, no token
 * lifecycle — just SMTP-via-Resend.
 */

import { Resend } from 'resend';
import { env } from '$env/dynamic/private';
import { prisma } from '$lib/server/db';
import type { Interview, Talent } from '@prisma/client';
import {
  buildIcsCalendar,
  hashInterviewBody,
  uidFor,
  type IcsMethod,
} from './ics';
import type {
  CalendarSyncBackend,
  CalendarSyncState,
  ReconcileOpts,
  ReconcileResult,
} from './types';

const FROM_EMAIL = env.RESEND_FROM_EMAIL || 'Jump <noreply@jump.fr>';
const ORGANIZER_EMAIL = parseFromEmail(FROM_EMAIL);

/**
 * Dev-only override: when set, every invite is rerouted to this address
 * regardless of the intended recipient. The original recipient is
 * preserved inside the iCalendar `ATTENDEE` field (so Outlook still shows
 * who the invite was meant for) and prefixed in the email subject. Use
 * when developing locally with seeded fake `*.epitech.eu` addresses that
 * cannot actually receive mail. Leave unset in production.
 */
const DEV_REDIRECT = env.INTERVIEW_SYNC_DEV_REDIRECT?.trim() || null;

let resend: Resend | null = null;
function getResend(): Resend {
  if (!resend) resend = new Resend(env.RESEND_API_KEY);
  return resend;
}

function parseFromEmail(from: string): { email: string; name?: string } {
  // Accept either `Name <email>` or bare `email`.
  const match = /^\s*(.+?)\s*<([^>]+)>\s*$/.exec(from);
  if (match) return { name: match[1], email: match[2] };
  return { email: from.trim() };
}

async function getRecipientEmail(userId: string): Promise<string | null> {
  const user = await prisma.bauth_user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  return user?.email ?? null;
}

async function sendInvite(args: {
  to: string;
  toName?: string;
  interview: Interview & { talent: Talent };
  sequence: number;
  method: IcsMethod & ('REQUEST' | 'CANCEL');
  /** Campus timezone, used to format the readable body. */
  timezone: string;
}): Promise<boolean> {
  const cancel = args.method === 'CANCEL';
  const ics = buildIcsCalendar({
    method: args.method,
    events: [
      {
        interview: args.interview,
        uid: uidFor(args.interview.id),
        sequence: args.sequence,
        cancelled: cancel,
        organizer: ORGANIZER_EMAIL,
        attendees: [{ email: args.to, name: args.toName }],
      },
    ],
  });

  const subjectVerb = cancel ? 'Annulé' : 'Entretien';
  const baseSubject = `${subjectVerb} — ${args.interview.talent.prenom} ${args.interview.talent.nom}`;
  const subject = DEV_REDIRECT ? `[→ ${args.to}] ${baseSubject}` : baseSubject;
  const recipient = DEV_REDIRECT ?? args.to;
  const date = args.interview.date.toLocaleString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: args.timezone,
  });

  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to: recipient,
      subject,
      text: cancel
        ? `L'entretien avec ${args.interview.talent.prenom} ${args.interview.talent.nom} prévu le ${date} a été annulé.`
        : `Entretien avec ${args.interview.talent.prenom} ${args.interview.talent.nom} le ${date}.\n\nAcceptez l'invitation pour l'ajouter à votre agenda.`,
      attachments: [
        {
          filename: cancel ? 'cancellation.ics' : 'invite.ics',
          content: Buffer.from(ics, 'utf-8').toString('base64'),
          // `method=REQUEST|CANCEL` on the Content-Type is what flips
          // Outlook from "attachment" to "auto-add invite". Resend
          // forwards this verbatim as `content_type` on the API.
          contentType: `text/calendar; method=${args.method}; charset=utf-8`,
        },
      ],
    });
    return true;
  } catch (err) {
    console.error('email invite send failed', err);
    return false;
  }
}

export const emailBackend: CalendarSyncBackend = {
  mode: 'email',

  async reconcile(opts: ReconcileOpts): Promise<ReconcileResult> {
    const recipient = await getRecipientEmail(opts.userId);
    if (!recipient) return { error: 'no_email' };

    const [interviews, syncs] = await Promise.all([
      prisma.interview.findMany({
        where: {
          staffId: opts.staffProfileId,
          participation: { eventId: opts.eventId },
        },
        include: { talent: true },
      }),
      prisma.outlookCalendarSync.findMany({
        where: {
          userId: opts.userId,
          syncKind: 'email',
          interview: {
            OR: [
              { staffId: opts.staffProfileId },
              { participation: { eventId: opts.eventId } },
            ],
          },
        },
        include: { interview: { include: { talent: true } } },
      }),
    ]);

    const summary = { created: 0, updated: 0, deleted: 0, failed: 0 };
    const syncByInterviewId = new Map(syncs.map((s) => [s.interviewId, s]));
    const liveInterviewIds = new Set(interviews.map((i) => i.id));

    // 1) Emit REQUEST for new / changed assignments.
    for (const iv of interviews) {
      if (iv.status === 'cancelled') continue; // handled in pass 2
      const hash = hashInterviewBody(iv);
      const existing = syncByInterviewId.get(iv.id);
      if (existing && existing.contentHash === hash) continue; // unchanged
      const sequence = existing ? existing.sequence + 1 : 0;

      const ok = await sendInvite({
        to: recipient,
        interview: iv,
        sequence,
        method: 'REQUEST',
        timezone: opts.timezone,
      });
      if (!ok) {
        summary.failed += 1;
        continue;
      }
      if (existing) {
        await prisma.outlookCalendarSync.update({
          where: { id: existing.id },
          data: { sequence, contentHash: hash },
        });
        summary.updated += 1;
      } else {
        await prisma.outlookCalendarSync.create({
          data: {
            interviewId: iv.id,
            userId: opts.userId,
            outlookEventId: uidFor(iv.id),
            syncKind: 'email',
            sequence: 0,
            contentHash: hash,
          },
        });
        summary.created += 1;
      }
    }

    // 2) Emit CANCEL for sync rows whose interview is no longer assigned
    //    to this staff or has been cancelled. `iv` is always present:
    //    either it's in `interviews` (when stillAssigned) or it falls back
    //    to `sync.interview`, which Prisma's include + the FK cascade keep
    //    non-null. Outright deletion of an interview cascades the sync row
    //    too, so we never see an orphaned sync here.
    for (const sync of syncs) {
      const stillAssigned = liveInterviewIds.has(sync.interviewId);
      const iv = stillAssigned
        ? interviews.find((i) => i.id === sync.interviewId)!
        : sync.interview;
      const cancelled = iv.status === 'cancelled';
      if (stillAssigned && !cancelled) continue;

      const ok = await sendInvite({
        to: recipient,
        interview: iv,
        sequence: sync.sequence + 1,
        method: 'CANCEL',
        timezone: opts.timezone,
      });
      if (ok) {
        await prisma.outlookCalendarSync.delete({ where: { id: sync.id } });
        summary.deleted += 1;
      } else {
        summary.failed += 1;
      }
    }

    return summary;
  },

  async loadState(opts: ReconcileOpts): Promise<CalendarSyncState> {
    const recipient = await getRecipientEmail(opts.userId);
    const agg = await prisma.outlookCalendarSync.aggregate({
      where: {
        userId: opts.userId,
        syncKind: 'email',
        interview: {
          staffId: opts.staffProfileId,
          participation: { eventId: opts.eventId },
        },
      },
      _count: { _all: true },
      _max: { syncedAt: true },
    });
    return {
      mode: 'email',
      status: { kind: 'email_ready', recipient },
      syncedCount: agg._count?._all ?? 0,
      lastSyncedAt: agg._max?.syncedAt ?? null,
    };
  },
};
