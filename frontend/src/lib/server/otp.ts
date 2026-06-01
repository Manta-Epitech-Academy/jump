/**
 * Transactional mail entry points for the OTP login flows and the parent
 * welcome. All bodies + subjects now live in MessageTemplate rows bound
 * by action key in EmailActionMapping. Edit them at `/staff/admin/email-actions`.
 *
 * When no template is mapped, the send is silently skipped — admins see
 * the warning in `/staff/admin/email-actions`. The caller (BetterAuth's
 * sendVerificationOTP callback, the onboarding action) doesn't error.
 */

import { env } from '$env/dynamic/private';
import { base } from '$app/paths';
import { prisma } from '$lib/server/db';
import { sendActionEmail } from '$lib/server/email/actionMail';
import {
  mintParentFastloginToken,
  buildParentFastloginLink,
} from '$lib/server/auth/fastloginToken';

export async function sendOtpEmail(
  email: string,
  otp: string,
  name?: string,
): Promise<void> {
  await sendActionEmail('otp_talent', email, {
    prenom: name || 'futur·e codeur·se',
    otp_code: otp,
  });
}

export async function sendParentWelcomeEmail(
  email: string,
  parentName: string,
  childName: string,
  talentId: string,
): Promise<void> {
  const displayName =
    parentName.charAt(0).toUpperCase() + parentName.slice(1).toLowerCase();
  // Passwordless magic link straight into the parent space (image-rights
  // signature). The parent `bauth_user` is provisioned right before this
  // send, so `/parent/fastlogin` resolves it without bootstrapping.
  const token = await mintParentFastloginToken({ email, talentId });
  const parentFastloginLink = buildParentFastloginLink(token);
  // Manual OTP page kept as a fallback for templates still on {{login_link}}.
  const loginUrl = `${env.ORIGIN}${base}/parent/login`;
  // The template references {{campus}} and {{email_contact_campus}}; resolve them
  // from the talent's effective campus (most-recent participation), matching the
  // resolution in hooks.server.ts. Without this they fall through to the empty
  // context in actionMail and render blank ("campus de ." / "écrire à ,").
  const talent = await prisma.talent.findUnique({
    where: { id: talentId },
    select: {
      participations: {
        take: 1,
        orderBy: { event: { date: 'desc' } },
        select: { campus: { select: { name: true, contactEmail: true } } },
      },
    },
  });
  const campus = talent?.participations[0]?.campus;
  await sendActionEmail('parent_welcome', email, {
    parent_prenom: displayName,
    child_prenom: childName,
    parent_fastlogin_link: parentFastloginLink,
    login_link: loginUrl,
    campus: campus?.name ?? '',
    email_contact_campus: campus?.contactEmail ?? null,
  });
}

export async function sendParentOtpEmail(
  email: string,
  otp: string,
  name?: string,
): Promise<void> {
  const loginUrl = `${env.ORIGIN}${base}/parent/login`;
  await sendActionEmail('otp_parent', email, {
    parent_prenom: name || 'Parent',
    otp_code: otp,
    login_link: loginUrl,
  });
}
