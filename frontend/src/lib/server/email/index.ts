/**
 * Provider-agnostic mail façade. Picks the active backend at module load
 * based on `MAIL_PROVIDER`. Callers depend only on this file: flip the
 * env var, redeploy, no code changes.
 *
 *   - resend  (default) → `./providers/resend.ts` (SDK)
 *   - mailjet           → `./providers/mailjet.ts` (REST via fetch)
 *
 * The dev-redirect (see `./dev-redirect.ts`) is applied here, before the
 * provider sees the payload, so the dev-trap works uniformly regardless of
 * which backend is active. Each send may steer the trap's destination via
 * `SendOptions.devRedirect`; the trap itself is gated by `OUTBOUND_MODE`
 * (`$lib/server/outbound`); see `resolveMailRouting`.
 */

import { mailProviderKind } from './config';
import { resendProvider } from './providers/resend';
import { mailjetProvider } from './providers/mailjet';
import { resolveMailRouting, applyDevRedirect } from './dev-redirect';
import type {
  MailMessage,
  MailProvider,
  SendEmailResult,
  SendOptions,
} from './types';

export type {
  MailMessage,
  SendEmailFailure,
  SendEmailResult,
  SendOptions,
} from './types';
export { MAIL_FROM } from './config';

const provider: MailProvider =
  mailProviderKind === 'mailjet' ? mailjetProvider : resendProvider;

/**
 * Max messages per `sendEmailBatch` call. Provider-dependent: callers that
 * page through large recipient lists should chunk against this constant.
 */
export const MAIL_BATCH_MAX = provider.batchMax;

/** A trapped send with no safe destination: suppressed, surfaced as a loud
 * permanent failure (see `OutboundRouting`'s `drop`). The provider is never
 * called, so no real recipient is ever reached. */
function droppedResult(reason: string): SendEmailResult {
  return { ok: false, reason: 'dev_redirect_dropped', message: reason };
}

export async function sendEmail(
  payload: MailMessage,
  opts?: SendOptions,
): Promise<SendEmailResult> {
  const routing = resolveMailRouting(opts?.devRedirect);
  if (routing.kind === 'drop') return droppedResult(routing.reason);
  const final =
    routing.kind === 'redirect'
      ? applyDevRedirect(payload, routing.to)
      : payload;
  return provider.send(final);
}

export async function sendEmailBatch(
  payloads: MailMessage[],
  opts?: SendOptions,
): Promise<SendEmailResult[]> {
  if (payloads.length === 0) return [];
  if (payloads.length > MAIL_BATCH_MAX) {
    throw new Error(
      `sendEmailBatch: ${payloads.length} > batch cap of ${MAIL_BATCH_MAX} (provider: ${provider.name})`,
    );
  }
  const routing = resolveMailRouting(opts?.devRedirect);
  if (routing.kind === 'drop') {
    // One dropped outcome per payload, aligned by index like the provider would.
    return payloads.map(() => droppedResult(routing.reason));
  }
  const finalPayloads =
    routing.kind === 'redirect'
      ? payloads.map((p) => applyDevRedirect(p, routing.to))
      : payloads;
  return provider.sendBatch(finalPayloads);
}
