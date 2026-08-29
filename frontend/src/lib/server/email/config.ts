import { env } from '$env/dynamic/private';

/**
 * Which transactional mail provider to use.
 *
 *   - `resend` (default): legacy backend. Requires `RESEND_API_KEY`.
 *     Kept as the default so existing deployments keep working until
 *     they explicitly flip the env.
 *   - `mailjet`: REST v3.1 Send API via fetch. Requires
 *     `MAILJET_API_KEY` + `MAILJET_API_SECRET`.
 *
 * Picked at server start. Flipping providers is just an env change +
 * redeploy: call sites depend only on `$lib/server/email`.
 */
export type MailProviderKind = 'resend' | 'mailjet';

const RAW = (env.MAIL_PROVIDER ?? 'resend').toLowerCase();

export const mailProviderKind: MailProviderKind =
  RAW === 'mailjet' ? 'mailjet' : 'resend';

/**
 * Sender address for transactional emails. Prefer the provider-agnostic
 * `MAIL_FROM`; falls back to the legacy `RESEND_FROM_EMAIL` so we don't
 * break older `.env` files mid-migration.
 */
export const MAIL_FROM =
  env.MAIL_FROM || env.RESEND_FROM_EMAIL || 'Jump <noreply@jump.fr>';
