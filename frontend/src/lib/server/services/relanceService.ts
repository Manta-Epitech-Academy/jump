import { env } from '$env/dynamic/private';
import { base } from '$app/paths';
import { prisma } from '$lib/server/db';
import { scopedPrisma } from '$lib/server/db/scoped';
import {
  classifyRelanceSkip,
  formatTalentVars,
  RELANCE_SKIP_LABELS,
  type RelanceSkipReason,
  type RelanceType,
} from '$lib/domain/relance';
import {
  substituteVariables,
  EMPTY_VARIABLE_CONTEXT,
  type VariableContext,
} from '$lib/domain/broadcastVariables';
import { renderBroadcastMail } from '$lib/domain/broadcastMarkdown';
import { sendEmail } from '$lib/server/email/resend';

const FROM_EMAIL = env.RESEND_FROM_EMAIL || 'Jump <noreply@jump.fr>';

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

export async function sendRelances(
  input: SendRelancesInput,
): Promise<SendRelancesResult> {
  const { talentIds, type, subject, body, sentBy, campusId } = input;
  const db = scopedPrisma(campusId);

  // Gate at the top: no template bound for this action → every recipient
  // bucketed as `noTemplate`. Consistent with the global rule "no template
  // = email ignored". Admin warning lives in /staff/admin/email-actions.
  const actionKey = actionKeyFor(type);
  const mapping = await prisma.emailActionMapping.findUnique({
    where: { actionKey },
    select: { actionKey: true },
  });
  if (!mapping) {
    console.warn(
      `[relance] No template mapped for action="${actionKey}" — skipping ${talentIds.length} recipient(s).`,
    );
    const skipCounts: RelanceSkipCounts = {
      cooldown: 0,
      completed: 0,
      noEmail: 0,
      error: 0,
      noTemplate: talentIds.length,
    };
    return { sent: 0, skipped: talentIds.length, skipCounts };
  }

  const talents = await db.talent.findMany({
    where: { id: { in: talentIds } },
    select: {
      id: true,
      nom: true,
      prenom: true,
      email: true,
      parentEmail: true,
      parentNom: true,
      parentPrenom: true,
      infoValidatedAt: true,
      rulesSignedAt: true,
      charterAcceptedAt: true,
      imageRightsSignedAt: true,
      // Fall back to the auth email when talent.email is unset — student
      // pages surface user.email as the canonical contact, and skipping
      // a relance for a logged-in talent who never had talent.email
      // populated would be a false-negative.
      user: { select: { email: true } },
      reminders: {
        where: { type },
        orderBy: { sentAt: 'desc' },
        take: 1,
        select: { sentAt: true },
      },
    },
  });

  let sent = 0;
  const skipCounts: RelanceSkipCounts = {
    cooldown: 0,
    completed: 0,
    noEmail: 0,
    error: 0,
    noTemplate: 0,
  };
  const loginLink = loginLinkFor(type);

  for (const talent of talents) {
    const studentEmail = talent.email ?? talent.user?.email ?? null;
    const eligibilityTalent =
      type === 'student' ? { ...talent, email: studentEmail } : talent;
    const skipReason = classifyRelanceSkip({
      type,
      talent: eligibilityTalent,
      lastReminderAt: talent.reminders[0]?.sentAt,
    });
    if (skipReason) {
      skipCounts[skipReason]++;
      continue;
    }

    const recipient = type === 'student' ? studentEmail! : talent.parentEmail!;
    const talentVars = formatTalentVars(talent);
    const ctx: VariableContext = {
      ...EMPTY_VARIABLE_CONTEXT,
      ...talentVars,
      login_link: loginLink,
    };
    const renderedSubject = substituteVariables(subject, ctx);
    const renderedBody = substituteVariables(body, ctx);
    const html = renderBroadcastMail(renderedBody);

    const sendResult = await sendEmail({
      from: FROM_EMAIL,
      to: recipient,
      subject: renderedSubject,
      html,
    });
    if (!sendResult.ok) {
      // Skip the audit write on failure — otherwise the "Historique des
      // relances" panel shows a relance that never left Resend, and the
      // cooldown classifier blocks the next genuine retry as if it had.
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
          subject: renderedSubject,
          body: renderedBody,
          sentBy,
        },
      });
      sent++;
    } catch (err) {
      // Email went out but the audit write failed — count it as `error`
      // so the staff toast surfaces it. The duplicate-send risk on retry
      // is bounded by the per-(type, talent) cooldown classifier.
      console.error('relance audit write failed', err);
      skipCounts.error++;
    }
  }

  const skipped =
    skipCounts.cooldown +
    skipCounts.completed +
    skipCounts.noEmail +
    skipCounts.error +
    skipCounts.noTemplate;
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
