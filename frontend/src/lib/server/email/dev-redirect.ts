import { env } from '$env/dynamic/private';
import {
  currentActorEmail,
  currentArmedRealSends,
  currentDevRedirectEmails,
} from '$lib/server/requestContext';
import { outboundTrapped, type OutboundRouting } from '$lib/server/outbound';
import type { DevRedirectControl, MailMessage } from './types';

/**
 * Dev-redirect splits into two concerns:
 *
 *   1. THE GATE — "is this environment allowed to reach real recipients?"
 *      Owned by `OUTBOUND_MODE` (see `$lib/server/outbound`), shared with SMS,
 *      fail-safe and env-only. Not this file's concern beyond consulting it.
 *
 *   2. THE DESTINATION — "when trapped, where does the copy land?" Resolved
 *      here, per-send, via `DevRedirectControl` (see `resolveMailRouting`).
 *      `EMAIL_DEV_RECIPIENTS` is the *fallback* destination for sends with no
 *      better target (headless cron / logged-out OTP) — no longer the gate.
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

/**
 * Resolve where one send should actually go, given its per-send control.
 *
 * `{ kind: 'real' }` (deliver to the real recipient) in exactly these cases:
 *   - the gate is off (prod) — `control` is ignored entirely, so a stray
 *     `'bypass'` or override can never escape a real send to debug addresses;
 *   - the gate is on but `control === 'bypass'` — the explicit single-recipient
 *     test-send escape (the human typed the address, so honour it);
 *   - armed real sends (`armRealSends.ts`) — the acting human has deliberately
 *     lifted the trap for their session.
 *
 * Otherwise it's `{ kind: 'redirect', to }`, in destination priority order:
 *   - a non-empty `string[]` control (e.g. a bulk broadcast routes its copies to
 *     the staff member who triggered it);
 *   - the acting staff member's personal `devRedirectEmails` (configured by
 *     admins in the settings dialog) — so a tester on a shared dev env only
 *     receives their own traffic, at an address they actually read. On a
 *     logged-out request (e.g. the OTP login flow) the "acting staff" can be a
 *     pinned admin — see the dev-redirect pin in `hooks.server.ts`;
 *   - the acting human's login email — a reasonable default when they haven't
 *     configured a personal list;
 *   - the `EMAIL_DEV_RECIPIENTS` fallback — the last-resort floor for sends with
 *     no actor *and* no pin (headless cron / anonymization). Interactive
 *     logged-out testing should arm a pin instead of relying on this list.
 *
 * If trapped and *none* of those resolve a destination, it's `{ kind: 'drop' }`:
 * the send is suppressed rather than leaked to the real recipient (fail-closed).
 */
export function resolveMailRouting(
  control?: DevRedirectControl,
): OutboundRouting {
  if (!outboundTrapped()) return { kind: 'real' }; // prod
  if (control === 'bypass') return { kind: 'real' }; // explicit single-send escape
  if (currentArmedRealSends()) return { kind: 'real' }; // armed this session
  if (Array.isArray(control) && control.length > 0) {
    return { kind: 'redirect', to: [...control] };
  }
  const personal = currentDevRedirectEmails();
  if (personal.length > 0) return { kind: 'redirect', to: [...personal] }; // tester's inbox
  const actor = currentActorEmail();
  if (actor) return { kind: 'redirect', to: [actor] }; // whoever caused the send
  const envList = parseDevRecipients();
  if (envList) return { kind: 'redirect', to: envList }; // headless fallback
  return {
    kind: 'drop',
    reason:
      'outbound trapped (OUTBOUND_MODE != real) but no dev mail destination resolved — arm a login-redirect pin (settings dialog), set a personal redirect list, or set EMAIL_DEV_RECIPIENTS',
  };
}

/**
 * The mail dev-redirect destination for a *bulk* send attributed to one staff
 * member on a trapped env: their configured personal `devRedirectEmails`, or
 * their login email as the fallback when they haven't set one. Returns `[]`
 * only when neither is known.
 *
 * Unlike `resolveMailRouting`, this reads an explicit staff record rather
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
