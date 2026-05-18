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
import { sendActionEmail } from '$lib/server/email/actionMail';

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
): Promise<void> {
  const displayName =
    parentName.charAt(0).toUpperCase() + parentName.slice(1).toLowerCase();
  const loginUrl = `${env.ORIGIN}${base}/parent/login`;
  await sendActionEmail('parent_welcome', email, {
    parent_prenom: displayName,
    child_prenom: childName,
    login_link: loginUrl,
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
