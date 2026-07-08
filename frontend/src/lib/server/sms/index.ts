/**
 * Provider-agnostic SMS façade, mirroring `$lib/server/email`. Picks the
 * active backend at module load from `SMS_PROVIDER`. Callers depend only on
 * this file — flip the env var, redeploy, no code changes.
 *
 *   - null  (default) → `./providers/null.ts` (fail-loud stub)
 *   - brevo           → `./providers/brevo.ts` (REST via fetch)
 *
 * The dev-redirect (see `./dev-redirect.ts`) is applied here, before the
 * provider sees the payload, so it works uniformly regardless of backend — and
 * so a misconfigured dev env can never text a real minor. The trap is gated by
 * `OUTBOUND_MODE` (`$lib/server/outbound`); see `resolveSmsRouting`.
 */

import { smsProviderKind } from './config';
import { brevoSmsProvider } from './providers/brevo';
import { nullSmsProvider } from './providers/null';
import { resolveSmsRouting, applyDevRedirect } from './dev-redirect';
import { toBrevoRecipient } from '$lib/domain/phone';
import type {
  SmsMessage,
  SmsProvider,
  SendSmsResult,
  SendOptions,
} from './types';

export type {
  SmsMessage,
  SendSmsResult,
  SendSmsFailure,
  SendOptions,
} from './types';
export { isSmsEnabled } from './config';

const provider: SmsProvider =
  smsProviderKind === 'brevo' ? brevoSmsProvider : nullSmsProvider;

export async function sendSms(
  payload: SmsMessage,
  opts?: SendOptions,
): Promise<SendSmsResult> {
  const routing = resolveSmsRouting(opts?.devRedirect);

  // Trapped with no safe destination: suppress, surfaced as a loud permanent
  // failure. The provider is never called, so no real number is reached.
  if (routing.kind === 'drop') {
    return {
      ok: false,
      reason: 'dev_redirect_dropped',
      message: routing.reason,
    };
  }

  // Production path: a single SMS to the real recipient (one Brevo call).
  if (routing.kind === 'real') return provider.send(payload);

  // Dev override: fan out one copy per debug number (parity with mail). Each
  // number is normalized like a real recipient, falling back to the raw value
  // so an unparseable entry surfaces as a provider error rather than silently
  // vanishing. Collapse the sends into a single result the caller can branch
  // on: the first failure if any copy failed, otherwise the first success (so a
  // logged "sent" reflects reality).
  const results = await Promise.all(
    routing.to.map((raw) =>
      provider.send(applyDevRedirect(payload, toBrevoRecipient(raw) ?? raw)),
    ),
  );
  return results.find((r) => !r.ok) ?? results[0];
}
