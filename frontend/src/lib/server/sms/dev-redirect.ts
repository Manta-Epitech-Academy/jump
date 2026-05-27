import { env } from '$env/dynamic/private';
import {
  currentArmedRealSends,
  currentDevRedirectPhones,
} from '$lib/server/requestContext';
import type { DevRedirectControl, SmsMessage } from './types';

/**
 * SMS dev-redirect, mirroring `$lib/server/email/dev-redirect.ts`. Two
 * concerns, kept apart:
 *
 *   1. THE GATE (`SMS_DEV_RECIPIENTS`, env-only) — any non-empty value means
 *      "not prod", so outbound SMS is trapped. Texting a real number from
 *      dev/staging is a privacy incident (recipients are minors, RGPD); the
 *      gate is immutable from the running app so that can never happen.
 *   2. THE DESTINATION (per-send `DevRedirectControl`) — where a trapped copy
 *      lands. Only consulted once the gate is active; fans out one copy per
 *      destination number, with the intended number prepended to the body.
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

/** The gate: is this environment trapping outbound SMS? Drives the dev banner. */
export function devRedirectActive(): boolean {
  return parseDevRecipients() !== null;
}

/**
 * Resolve where one SMS should actually go, given its per-send control.
 * Returns `null` = no redirect (deliver to the real recipient): either the
 * gate is off (prod, `control` ignored so a stray `'bypass'` can't escape a
 * real send) or `control === 'bypass'` (the explicit single-recipient
 * test-send escape). Otherwise, in priority order: armed real sends
 * (`armRealSends.ts`); a non-empty `string[]` control; the acting staff
 * member's personal `devRedirectPhones` (configured by admins in the settings
 * dialog, so each tester gets SMS on their own handset); else the shared env
 * list. See the mail twin for the rationale.
 *
 * Note there's no login-phone fallback as mail has a login-email one — staff
 * accounts carry no phone, so an SMS only reaches a tester once they've added
 * their number in the settings dialog; until then it falls back to the env list.
 */
export function resolveDevRecipients(
  control?: DevRedirectControl,
): string[] | null {
  const envList = parseDevRecipients();
  if (!envList) return null; // gate off: prod, deliver for real
  if (control === 'bypass') return null; // explicit single-send escape
  if (currentArmedRealSends()) return null; // human armed real sends this session
  if (Array.isArray(control) && control.length > 0) return [...control];
  const personal = currentDevRedirectPhones();
  if (personal.length > 0) return [...personal]; // tester's own handset
  return envList; // default safety net
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
