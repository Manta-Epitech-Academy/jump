import { Resend } from 'resend';
import { env } from '$env/dynamic/private';
import { base } from '$app/paths';
import { prisma } from '$lib/server/db';
import { scopedPrisma } from '$lib/server/db/scoped';
import {
  applyPlaceholders,
  classifyRelanceSkip,
  formatTalentVars,
  relanceGreeting,
  RELANCE_SKIP_LABELS,
  type RelanceSkipReason,
  type RelanceType,
} from '$lib/domain/relance';
import {
  buildBrandEmailHtml,
  buildBrandEmailText,
  type BrandEmailCta,
} from '$lib/server/templates/brandEmail';

const FROM_EMAIL = env.RESEND_FROM_EMAIL || 'Jump <noreply@jump.fr>';
const SIGNATURE = "À très vite,\nL'équipe Epitech Academy";

let resend: Resend;
function getResend(): Resend {
  if (!resend) {
    resend = new Resend(env.RESEND_API_KEY);
  }
  return resend;
}

function ctaFor(type: RelanceType): BrandEmailCta {
  if (type === 'student') {
    return {
      label: 'Finaliser mon inscription',
      url: `${env.ORIGIN}${base}/onboarding`,
    };
  }
  return {
    label: "Signer le droit à l'image",
    url: `${env.ORIGIN}${base}/parent/login`,
  };
}

export type SendRelancesInput = {
  talentIds: string[];
  type: RelanceType;
  subject: string;
  body: string;
  sentBy: string;
  campusId: string;
};

/** Server-side skip buckets — the predictable reasons plus transport errors. */
type ServerSkipReason = RelanceSkipReason | 'error';
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
  };
  const cta = ctaFor(type);

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
    const vars = formatTalentVars(talent);
    const renderedSubject = applyPlaceholders(subject, vars);
    const renderedBody = applyPlaceholders(body, vars);
    const greeting = relanceGreeting(type, vars);

    try {
      await getResend().emails.send({
        from: FROM_EMAIL,
        to: recipient,
        subject: renderedSubject,
        text: buildBrandEmailText({
          greeting,
          body: renderedBody,
          cta,
          signature: SIGNATURE,
        }),
        html: buildBrandEmailHtml({
          greeting,
          body: renderedBody,
          cta,
          signature: SIGNATURE,
        }),
      });

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
    } catch {
      skipCounts.error++;
    }
  }

  const skipped =
    skipCounts.cooldown +
    skipCounts.completed +
    skipCounts.noEmail +
    skipCounts.error;
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
