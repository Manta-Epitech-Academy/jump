import { env } from '$env/dynamic/private';
import type { MailMessage } from './types';

/**
 * Dev-only override: when `EMAIL_DEV_RECIPIENTS` (comma-separated) is set,
 * every outbound email is rerouted to those addresses instead of the
 * intended recipients. The subject is prefixed with the original `to` so
 * the developer can tell who would have received it in prod. Unset (or
 * empty) = production behaviour, mail goes to the real recipients. Treat
 * any non-empty value as "this is not prod".
 */
export function parseDevRecipients(): string[] | null {
  const raw = env.EMAIL_DEV_RECIPIENTS?.trim();
  if (!raw) return null;
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : null;
}

export function applyDevRedirect(
  payload: MailMessage,
  devRecipients: string[],
): MailMessage {
  const originalTo = Array.isArray(payload.to)
    ? payload.to.join(', ')
    : payload.to;
  return {
    ...payload,
    to: devRecipients,
    subject: originalTo
      ? `[→ ${originalTo}] ${payload.subject ?? ''}`
      : (payload.subject ?? ''),
  };
}
