import { env } from '$env/dynamic/private';
import type { SmsMessage } from './types';

/**
 * Dev-only override: when `SMS_DEV_RECIPIENTS` is set (comma-separated; the
 * first entry is used), every outbound SMS is rerouted to that number instead
 * of the real recipient, with the intended number prepended to the body.
 *
 * Recipients are minors and their parents (RGPD) — texting a real number from
 * dev/staging is a privacy incident. Treat ANY non-empty value as "this is
 * not prod"; unset = production behaviour (real recipients).
 */
export function parseDevRecipient(): string | null {
  const raw = env.SMS_DEV_RECIPIENTS?.trim();
  if (!raw) return null;
  const first = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)[0];
  return first ?? null;
}

export function applyDevRedirect(
  payload: SmsMessage,
  devRecipient: string,
): SmsMessage {
  return {
    to: devRecipient,
    body: `[→ ${payload.to}] ${payload.body}`,
  };
}
