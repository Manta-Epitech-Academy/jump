/**
 * Provider-agnostic SMS façade, mirroring `$lib/server/email`. Picks the
 * active backend at module load from `SMS_PROVIDER`. Callers depend only on
 * this file — flip the env var, redeploy, no code changes.
 *
 *   - null  (default) → `./providers/null.ts` (fail-loud stub)
 *   - brevo           → `./providers/brevo.ts` (REST via fetch)
 *
 * The `SMS_DEV_RECIPIENTS` redirect (see `./dev-redirect.ts`) is applied here,
 * before the provider sees the payload, so it works uniformly regardless of
 * backend — and so a misconfigured dev env can never text a real minor.
 */

import { smsProviderKind } from './config';
import { brevoSmsProvider } from './providers/brevo';
import { nullSmsProvider } from './providers/null';
import { parseDevRecipient, applyDevRedirect } from './dev-redirect';
import { toBrevoRecipient } from '$lib/domain/phone';
import type { SmsMessage, SmsProvider, SendSmsResult } from './types';

export type { SmsMessage, SendSmsResult, SendSmsFailure } from './types';
export { isSmsEnabled, smsProviderKind, SMS_SENDER } from './config';

const provider: SmsProvider =
  smsProviderKind === 'brevo' ? brevoSmsProvider : nullSmsProvider;

export async function sendSms(payload: SmsMessage): Promise<SendSmsResult> {
  // Normalize the dev override the same way real recipients are normalized
  // (see the broadcast adapter / relance service) so `SMS_DEV_RECIPIENTS`
  // accepts any French-entered shape (+33…, 06…, 0033…). Fall back to the
  // raw value if it can't be parsed, letting the provider surface the error.
  const rawDev = parseDevRecipient();
  const devRecipient = rawDev ? (toBrevoRecipient(rawDev) ?? rawDev) : null;
  const final = devRecipient
    ? applyDevRedirect(payload, devRecipient)
    : payload;
  return provider.send(final);
}
