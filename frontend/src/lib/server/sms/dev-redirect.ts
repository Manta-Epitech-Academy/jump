import { env } from '$env/dynamic/private';
import {
  currentArmedRealSends,
  currentDevRedirectPhones,
} from '$lib/server/requestContext';
import { outboundTrapped, type OutboundRouting } from '$lib/server/outbound';
import type { DevRedirectControl, SmsMessage } from './types';

/**
 * SMS dev-redirect, mirroring `$lib/server/email/dev-redirect.ts`. Two
 * concerns, kept apart:
 *
 *   1. THE GATE — `OUTBOUND_MODE` (see `$lib/server/outbound`), shared with
 *      mail, fail-safe and env-only. Texting a real number from dev/staging is
 *      a privacy incident (recipients are minors, RGPD); the gate is immutable
 *      from the running app so that can never happen by accident.
 *   2. THE DESTINATION (per-send `DevRedirectControl`) — where a trapped copy
 *      lands. `SMS_DEV_RECIPIENTS` is the *fallback* destination, not the gate.
 *      The façade fans out one copy per destination number, with the intended
 *      number prepended to the body.
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

/**
 * Where a trapped *bulk* SMS lands: the broadcast creator's configured phones.
 * SMS twin of `staffBulkDevRedirectEmails`, with the same single-source-of-truth
 * role — two callers must agree on the destination: the actor (`orchestrator.ts
 * → sendSmsSerial`) and the predictor (the broadcast banner). If they drifted,
 * the banner would claim a destination the send doesn't use.
 *
 * Unlike mail there's no login fallback — staff accounts carry no login phone,
 * so an unconfigured creator yields `[]` and the bulk send falls back to
 * `SMS_DEV_RECIPIENTS` (or drops). Resolved from the persisted creator row, not
 * the request context, because the send can run in the worker after the
 * enqueuing request is gone (`currentDevRedirectPhones()` would be empty there).
 */
export function staffBulkDevRedirectPhones(
  devRedirectPhones: readonly string[] | null | undefined,
): string[] {
  return [...(devRedirectPhones ?? [])];
}

/**
 * Resolve where one SMS should actually go, given its per-send control. See the
 * mail twin (`resolveMailRouting`) for the full rationale; the only difference
 * is there's no login-phone fallback — staff accounts carry no phone, so an SMS
 * only reaches a tester once they've added their number in the settings dialog,
 * otherwise it falls back to `SMS_DEV_RECIPIENTS`, and `drop`s if even that is
 * empty (fail-closed: never text a real number from a trapped env).
 */
export function resolveSmsRouting(
  control?: DevRedirectControl,
): OutboundRouting {
  if (!outboundTrapped()) return { kind: 'real' }; // prod
  if (control === 'bypass') return { kind: 'real' }; // explicit single-send escape
  if (currentArmedRealSends()) return { kind: 'real' }; // armed this session
  if (Array.isArray(control) && control.length > 0) {
    return { kind: 'redirect', to: [...control] };
  }
  const personal = currentDevRedirectPhones();
  if (personal.length > 0) return { kind: 'redirect', to: [...personal] }; // tester's handset
  const envList = parseDevRecipients();
  if (envList) return { kind: 'redirect', to: envList }; // headless fallback
  return {
    kind: 'drop',
    reason:
      'outbound trapped (OUTBOUND_MODE != real) but no dev SMS destination resolved — set SMS_DEV_RECIPIENTS or a personal redirect list',
  };
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
