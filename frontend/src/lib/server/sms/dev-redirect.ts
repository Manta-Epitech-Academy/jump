import { env } from '$env/dynamic/private';
import type { SmsMessage } from './types';

/**
 * Dev-only override: when `SMS_DEV_RECIPIENTS` is set (comma-separated), every
 * outbound SMS is rerouted away from the real recipient to each listed number
 * — one copy per debug number, with the intended number prepended to the body.
 * Mirrors `EMAIL_DEV_RECIPIENTS`, which fans out to its whole list.
 *
 * Recipients are minors and their parents (RGPD) — texting a real number from
 * dev/staging is a privacy incident. Treat ANY non-empty value as "this is
 * not prod"; unset = production behaviour (real recipients).
 */
export function parseDevRecipients(): string[] | null {
  const raw = env.SMS_DEV_RECIPIENTS?.trim();
  if (!raw) return null;
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : null;
}

export function applyDevRedirect(
  payload: SmsMessage,
  devRecipient: string,
): SmsMessage {
  return {
    to: devRecipient,
    // ASCII arrow only: '→' (U+2192) isn't in GSM-7, so it renders as garbage
    // on the handset and forces the whole SMS into UCS-2 (halving capacity).
    body: `[-> ${payload.to}] ${payload.body}`,
  };
}
