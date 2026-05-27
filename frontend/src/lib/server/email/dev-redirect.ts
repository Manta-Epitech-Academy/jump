import { env } from '$env/dynamic/private';
import {
  currentActorEmail,
  currentArmedRealSends,
  currentDevRedirectEmails,
} from '$lib/server/requestContext';
import type { DevRedirectControl, MailMessage } from './types';

/**
 * Dev-redirect splits into two concerns that used to be conflated in one env
 * var:
 *
 *   1. THE GATE — "is this environment allowed to reach real recipients?"
 *      Owned by `EMAIL_DEV_RECIPIENTS`: any non-empty value means "not prod",
 *      so outbound mail is trapped. This stays env-only and immutable from the
 *      running app — the app can never clear it and start mailing minors (RGPD).
 *
 *   2. THE DESTINATION — "when trapped, where does the copy land?"
 *      Per-send, via `DevRedirectControl` (see `resolveDevRecipients`). Only
 *      ever consulted once the gate is active, so it can never misroute a real
 *      prod send.
 *
 * The intended recipient is prepended to the subject so the developer can tell
 * who would have received it in prod.
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

/** The gate: is this environment trapping outbound mail? Drives the dev banner. */
export function devRedirectActive(): boolean {
  return parseDevRecipients() !== null;
}

/**
 * Resolve where one send should actually go, given its per-send control.
 * Returns `null` = no redirect, deliver to the real recipient. That happens in
 * exactly two cases:
 *
 *   - the gate is off (prod) — `control` is ignored entirely, so a stray
 *     `'bypass'` or override can never escape a real send to debug addresses;
 *   - the gate is on but `control === 'bypass'` — the explicit single-recipient
 *     test-send escape (the human typed the address, so honour it).
 *
 * Otherwise, in priority order:
 *   - armed real sends (`armRealSends.ts`) — the acting human has deliberately
 *     lifted the trap for their session, so deliver for real;
 *   - a non-empty `string[]` control overrides the destination (e.g. a bulk
 *     broadcast routes its copies to the staff member who triggered it);
 *   - the acting staff member's personal `devRedirectEmails` (configured by
 *     admins in the settings dialog) — so a tester on a shared dev env only
 *     receives their own traffic and to an address they actually read (an admin
 *     testing talent onboarding gets the parent mail in his own inbox);
 *   - the acting human's login email — a reasonable default when they haven't
 *     configured a personal list;
 *   - the shared env list — last resort, for sends with no request actor
 *     (cron, worker, logged-out OTP) or no staff identity behind them.
 */
export function resolveDevRecipients(
  control?: DevRedirectControl,
): string[] | null {
  const envList = parseDevRecipients();
  if (!envList) return null; // gate off: prod, deliver for real
  if (control === 'bypass') return null; // explicit single-send escape
  if (currentArmedRealSends()) return null; // human armed real sends this session
  if (Array.isArray(control) && control.length > 0) return [...control];
  const personal = currentDevRedirectEmails();
  if (personal.length > 0) return [...personal]; // tester's configured inbox
  const actor = currentActorEmail();
  if (actor) return [actor]; // reasonable default: whoever caused the send
  return envList; // headless send: shared safety net
}

/**
 * The mail dev-redirect destination for a *bulk* send attributed to one staff
 * member on a trapped env: their configured personal `devRedirectEmails`, or
 * their login email as the fallback when they haven't set one. Returns `[]`
 * only when neither is known.
 *
 * Unlike `resolveDevRecipients`, this reads an explicit staff record rather
 * than the ambient request context — a broadcast send runs in the worker, long
 * after the enqueuing request is gone, so it must resolve the destination from
 * the persisted creator row. Single source of truth for two callers that must
 * agree: the actor (`orchestrator.ts → sendMailBatch`, where copies land) and
 * the predictor (the broadcast banner in `broadcasts/+layout.server.ts`, which
 * tells staff where they'll land). If these drifted, the banner would claim a
 * destination the send doesn't use.
 */
export function staffBulkDevRedirectEmails(
  devRedirectEmails: readonly string[] | null | undefined,
  loginEmail: string | null | undefined,
): string[] {
  const personal = devRedirectEmails ?? [];
  if (personal.length > 0) return [...personal];
  return loginEmail ? [loginEmail] : [];
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
