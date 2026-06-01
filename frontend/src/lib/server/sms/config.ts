import { env } from '$env/dynamic/private';

/**
 * Which SMS backend to use. Mirrors `MAIL_PROVIDER`.
 *
 *   - `null` (default): no real provider wired. Sends fail loud and
 *     non-retryably so an unconfigured prod surfaces "0 envoyés / N échecs"
 *     instead of a silent success.
 *   - `brevo`: Brevo (ex-Sendinblue) transactional SMS REST API via fetch.
 *     Requires `BREVO_API_KEY`.
 *
 * Picked at server start. Flipping providers is an env change + redeploy —
 * call sites depend only on `$lib/server/sms`.
 */
export type SmsProviderKind = 'brevo' | 'null';

const RAW = (env.SMS_PROVIDER ?? 'null').toLowerCase();

export const smsProviderKind: SmsProviderKind =
  RAW === 'brevo' ? 'brevo' : 'null';

/**
 * Whether a real SMS backend is configured. Surfaced to the relance UI so it
 * can disable the SMS channel (and explain why) instead of letting staff
 * compose an escalation that would only ever fail.
 */
export function isSmsEnabled(): boolean {
  return smsProviderKind !== 'null';
}

/**
 * Alphanumeric sender name shown on the recipient's handset. Brevo caps this
 * at 11 characters; longer values are rejected by the API. Defaults to the
 * brand the SMS speaks for.
 */
export const SMS_SENDER = (env.SMS_SENDER || 'Epitech').slice(0, 11);
