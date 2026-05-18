/**
 * Provider-agnostic mail façade. Picks the active backend at module load
 * based on `MAIL_PROVIDER`. Callers depend only on this file — flip the
 * env var, redeploy, no code changes.
 *
 *   - resend  (default) → `./providers/resend.ts` (SDK)
 *   - mailjet           → `./providers/mailjet.ts` (REST via fetch)
 *
 * The `EMAIL_DEV_RECIPIENTS` redirect (see `./dev-redirect.ts`) is applied
 * here, before the provider sees the payload, so the dev-trap works
 * uniformly regardless of which backend is active.
 */

import { mailProviderKind } from './config';
import { resendProvider } from './providers/resend';
import { mailjetProvider } from './providers/mailjet';
import { parseDevRecipients, applyDevRedirect } from './dev-redirect';
import type { MailMessage, MailProvider, SendEmailResult } from './types';

export type {
  MailAttachment,
  MailMessage,
  SendEmailFailure,
  SendEmailResult,
} from './types';
export { MAIL_FROM, mailProviderKind } from './config';

const provider: MailProvider =
  mailProviderKind === 'mailjet' ? mailjetProvider : resendProvider;

/**
 * Max messages per `sendEmailBatch` call. Provider-dependent — callers that
 * page through large recipient lists should chunk against this constant.
 */
export const MAIL_BATCH_MAX = provider.batchMax;

export async function sendEmail(
  payload: MailMessage,
): Promise<SendEmailResult> {
  const devRecipients = parseDevRecipients();
  const final = devRecipients
    ? applyDevRedirect(payload, devRecipients)
    : payload;
  return provider.send(final);
}

export async function sendEmailBatch(
  payloads: MailMessage[],
): Promise<SendEmailResult[]> {
  if (payloads.length === 0) return [];
  if (payloads.length > MAIL_BATCH_MAX) {
    throw new Error(
      `sendEmailBatch: ${payloads.length} > batch cap of ${MAIL_BATCH_MAX} (provider: ${provider.name})`,
    );
  }
  const devRecipients = parseDevRecipients();
  const finalPayloads = devRecipients
    ? payloads.map((p) => applyDevRedirect(p, devRecipients))
    : payloads;
  return provider.sendBatch(finalPayloads);
}

/**
 * Throw-on-failure variant for call sites whose contract is "this email
 * must go out or the calling action fails" (OTP delivery, parent welcome
 * from the onboarding flow). Keeps per-callsite ergonomics while
 * preserving the failure signal.
 */
export async function sendEmailOrThrow(payload: MailMessage): Promise<string> {
  const result = await sendEmail(payload);
  if (!result.ok) {
    throw new Error(`Mail ${result.reason}: ${result.message}`);
  }
  return result.id;
}
