import { env } from '$env/dynamic/private';
import { base } from '$app/paths';
import { prisma } from '$lib/server/db';
import { scopedPrisma } from '$lib/server/db/scoped';
import {
  classifyRelanceSkip,
  formatTalentVars,
  RELANCE_SKIP_LABELS,
  type RelanceChannel,
  type RelanceSkipReason,
  type RelanceType,
} from '$lib/domain/relance';
import { toBrevoRecipient } from '$lib/domain/phone';
import {
  substituteVariables,
  EMPTY_VARIABLE_CONTEXT,
  type VariableContext,
} from '$lib/domain/broadcastVariables';
import { renderBroadcastMail } from '$lib/domain/broadcastMarkdown';
import { sendEmail, MAIL_FROM } from '$lib/server/email';
import { sendSms } from '$lib/server/sms';
import {
  mintFastloginToken,
  buildFastloginLink,
  mintParentFastloginToken,
  buildParentFastloginLink,
} from '$lib/server/auth/fastloginToken';

function loginLinkFor(type: RelanceType): string {
  const path = type === 'student' ? '/onboarding' : '/parent/login';
  return `${env.ORIGIN}${base}${path}`;
}

function actionKeyFor(type: RelanceType): 'relance_student' | 'relance_parent' {
  return type === 'student' ? 'relance_student' : 'relance_parent';
}

export type SendRelancesInput = {
  talentIds: string[];
  type: RelanceType;
  /** 'email' is the primary nudge; 'sms' is the link-free escalation. */
  channel: RelanceChannel;
  /** Email subject. Ignored for SMS (no subject). */
  subject: string;
  body: string;
  sentBy: string;
  campusId: string;
};

/** Server-side skip buckets — predictable reasons + transport / config. */
type ServerSkipReason = RelanceSkipReason | 'error' | 'noTemplate';
export type RelanceSkipCounts = Record<ServerSkipReason, number>;

export type SendRelancesResult = {
  sent: number;
  skipped: number;
  skipCounts: RelanceSkipCounts;
};

function emptySkipCounts(): RelanceSkipCounts {
  return {
    cooldown: 0,
    completed: 0,
    noEmail: 0,
    noPhone: 0,
    noPriorEmail: 0,
    error: 0,
    noTemplate: 0,
  };
}

function sumSkips(c: RelanceSkipCounts): number {
  return (
    c.cooldown +
    c.completed +
    c.noEmail +
    c.noPhone +
    c.noPriorEmail +
    c.error +
    c.noTemplate
  );
}

export async function sendRelances(
  input: SendRelancesInput,
): Promise<SendRelancesResult> {
  const { talentIds, type, channel, subject, body, sentBy, campusId } = input;
  const db = scopedPrisma(campusId);
  const campus = await prisma.campus.findUnique({
    where: { id: campusId },
    select: { name: true, contactEmail: true },
  });

  // Email relances draw their draft from an admin-bound template, so a missing
  // mapping means every recipient is bucketed as `noTemplate` (consistent with
  // "no template = email ignored"; warning lives in /staff/admin/email-actions).
  // SMS escalation has no admin template — its body is the fixed `RELANCE_SMS_DEFAULTS`
  // pre-fill, editable in the dialog — so this gate doesn't apply.
  if (channel === 'email') {
    const actionKey = actionKeyFor(type);
    const mapping = await prisma.emailActionMapping.findUnique({
      where: { actionKey },
      select: { actionKey: true },
    });
    if (!mapping) {
      console.warn(
        `[relance] No template mapped for action="${actionKey}" — skipping ${talentIds.length} recipient(s).`,
      );
      const skipCounts = emptySkipCounts();
      skipCounts.noTemplate = talentIds.length;
      return { sent: 0, skipped: talentIds.length, skipCounts };
    }
  }

  const talents = await db.talent.findMany({
    where: { id: { in: talentIds } },
    select: {
      id: true,
      nom: true,
      prenom: true,
      email: true,
      phone: true,
      parentEmail: true,
      parentNom: true,
      parentPrenom: true,
      parentPhone: true,
      infoValidatedAt: true,
      rulesSignedAt: true,
      charterAcceptedAt: true,
      parentRulesSignedAt: true,
      imageRightsDecidedAt: true,
      // Fall back to the auth email when talent.email is unset — student
      // pages surface user.email as the canonical contact, and skipping
      // a relance for a logged-in talent who never had talent.email
      // populated would be a false-negative.
      user: { select: { email: true } },
      // All reminders of this type, both channels: we need the latest of the
      // *current* channel for the cooldown, and whether any *email* relance
      // already went out (SMS only escalates after one).
      reminders: {
        where: { type },
        orderBy: { sentAt: 'desc' },
        select: { sentAt: true, channel: true },
      },
    },
  });

  let sent = 0;
  const skipCounts = emptySkipCounts();
  const loginLink = loginLinkFor(type);

  for (const talent of talents) {
    const studentEmail = talent.email ?? talent.user?.email ?? null;
    const lastSameChannel = talent.reminders.find(
      (r) => r.channel === channel,
    )?.sentAt;
    const hasPriorEmail = talent.reminders.some((r) => r.channel === 'email');
    const skipReason = classifyRelanceSkip({
      type,
      channel,
      talent: { ...talent, email: studentEmail },
      lastReminderAt: lastSameChannel,
      hasPriorEmail,
    });
    if (skipReason) {
      skipCounts[skipReason]++;
      continue;
    }

    // The mailbox both channels speak about: student's own address or the
    // parent's. For SMS it's the value `{{email}}` names ("check this inbox").
    const mailbox = type === 'student' ? studentEmail! : talent.parentEmail!;
    const talentVars = formatTalentVars(talent);

    if (channel === 'sms') {
      const recipientPhone = toBrevoRecipient(
        type === 'student' ? talent.phone : talent.parentPhone,
      );
      // Eligibility already proved a usable phone; guard defensively so a
      // race can't hand the provider a null.
      if (!recipientPhone) {
        skipCounts.noPhone++;
        continue;
      }
      const ctx: VariableContext = {
        ...EMPTY_VARIABLE_CONTEXT,
        ...talentVars,
        email: mailbox,
        campus: campus?.name ?? '',
        email_contact_campus: campus?.contactEmail ?? null,
      };
      // No link rewrite: the SMS deliberately carries no action link.
      const renderedBody = substituteVariables(body, ctx);
      const sendResult = await sendSms({
        to: recipientPhone,
        body: renderedBody,
      });
      if (!sendResult.ok) {
        console.error(
          'relance sms failed',
          sendResult.reason,
          sendResult.message,
        );
        skipCounts.error++;
        continue;
      }
      try {
        await prisma.onboardingReminder.create({
          data: {
            talentId: talent.id,
            type,
            channel: 'sms',
            subject: null,
            body: renderedBody,
            sentBy,
          },
        });
        sent++;
      } catch (err) {
        console.error('relance sms audit write failed', err);
        skipCounts.error++;
      }
      continue;
    }

    // ── Email channel ──
    const recipient = mailbox;
    // Both relance kinds mint a passwordless magic link so the recipient skips
    // the OTP step. Student: `/fastlogin` signs them in, and the talent guard
    // bounces an unfinished onboarding straight to `/onboarding` (a relance is
    // never sent to a talent who already completed it). Parent: `/parent/fastlogin`
    // resolves the account created when the talent finished onboarding.
    // {{login_link}} stays in the context as a fallback for either audience.
    const fastloginLink =
      type === 'student'
        ? buildFastloginLink(
            await mintFastloginToken({ email: recipient, talentId: talent.id }),
          )
        : null;
    const parentFastloginLink =
      type === 'parent'
        ? buildParentFastloginLink(
            await mintParentFastloginToken({
              email: recipient,
              talentId: talent.id,
            }),
          )
        : null;
    const ctx: VariableContext = {
      ...EMPTY_VARIABLE_CONTEXT,
      ...talentVars,
      email: recipient,
      campus: campus?.name ?? '',
      login_link: loginLink,
      fastlogin_link: fastloginLink,
      parent_fastlogin_link: parentFastloginLink,
      email_contact_campus: campus?.contactEmail ?? null,
    };
    const renderedSubject = substituteVariables(subject, ctx);
    const renderedBody = substituteVariables(body, ctx);
    const html = renderBroadcastMail(renderedBody, env.ORIGIN ?? '');

    const sendResult = await sendEmail({
      from: MAIL_FROM,
      to: recipient,
      subject: renderedSubject,
      html,
    });
    if (!sendResult.ok) {
      // Skip the audit write on failure — otherwise the "Historique des
      // relances" panel shows a relance that never left the mail provider,
      // and the cooldown classifier blocks the next genuine retry as if
      // it had.
      console.error(
        'relance send failed',
        sendResult.reason,
        sendResult.message,
      );
      skipCounts.error++;
      continue;
    }

    try {
      // OnboardingReminder has no campusId — uses the unscoped client by
      // design; the talentId is enough to reach the row campus-side via
      // the FK.
      await prisma.onboardingReminder.create({
        data: {
          talentId: talent.id,
          type,
          channel: 'email',
          subject: renderedSubject,
          body: renderedBody,
          sentBy,
        },
      });
      sent++;
    } catch (err) {
      // Email went out but the audit write failed — count it as `error`
      // so the staff toast surfaces it. The duplicate-send risk on retry
      // is bounded by the per-(type, channel, talent) cooldown classifier.
      console.error('relance audit write failed', err);
      skipCounts.error++;
    }
  }

  const skipped = sumSkips(skipCounts);
  return { sent, skipped, skipCounts };
}

/**
 * Builds the toast message for a `SendRelancesResult`. Co-located so all
 * call sites format the success/skip line the same way. Only reasons that
 * actually occurred are listed, with their counts — staff sees "2 cooldown,
 * 1 email manquant" rather than the historical catch-all string.
 */
export function formatRelanceMessage(r: SendRelancesResult): string {
  const reasons = (Object.entries(r.skipCounts) as [ServerSkipReason, number][])
    .filter(([, n]) => n > 0)
    .map(([reason, n]) => `${n} ${RELANCE_SKIP_LABELS[reason]}`)
    .join(', ');

  if (r.sent === 0 && r.skipped === 0) {
    return 'Aucun destinataire éligible.';
  }

  if (r.sent > 0) {
    const pluralSent = r.sent > 1 ? 's' : '';
    const tail =
      r.skipped > 0
        ? ` ${r.skipped} ignorée${r.skipped > 1 ? 's' : ''} (${reasons}).`
        : '';
    return `${r.sent} relance${pluralSent} envoyée${pluralSent}.${tail}`;
  }

  return `Aucune relance envoyée. ${r.skipped} ignorée${r.skipped > 1 ? 's' : ''} (${reasons}).`;
}
