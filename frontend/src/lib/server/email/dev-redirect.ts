import { EMAIL_DEV_RECIPIENTS } from '$app/env/private';
import {
  currentActorEmail,
  currentDevRedirectEmails,
} from '#lib/server/requestContext.ts';
import {
  recipientList,
  resolveOutboundRouting,
  type DevRedirectControl,
  type OutboundRouting,
} from '#lib/server/outbound.ts';
import type { MailMessage } from './types';

/**
 * Dev-redirect splits into two concerns:
 *
 *   1. THE GATE: "is this environment allowed to reach real recipients?"
 *      Owned by `OUTBOUND_MODE` (see `#lib/server/outbound`), shared with SMS,
 *      fail-safe and env-only. Not this file's concern beyond consulting it.
 *
 *   2. THE DESTINATION: "when trapped, where does the copy land?" Resolved
 *      here, per-send, via `DevRedirectControl` (see `resolveMailRouting`).
 *      `EMAIL_DEV_RECIPIENTS` is the *fallback* destination for sends with no
 *      better target (headless cron / logged-out OTP), no longer the gate.
 *
 * The intended recipient is prepended to the subject so the developer can tell
 * who would have received it in prod.
 */
/**
 * Resolve where one mail should actually go, given its per-send control. The
 * shared head (prod, `bypass`, armed real sends, an explicit list) and the
 * fail-closed `drop` are `resolveOutboundRouting`'s; mail's own destinations,
 * in priority order:
 *   - the acting staff member's personal `devRedirectEmails` (configured by
 *     admins in the settings dialog), so a tester on a shared dev env only
 *     receives their own traffic, at an address they actually read. On a
 *     logged-out request (e.g. the OTP login flow) the "acting staff" can be a
 *     pinned admin (see the dev-redirect pin in `hooks.server.ts`);
 *   - the acting human's login email: a reasonable default when they haven't
 *     configured a personal list;
 *   - the `EMAIL_DEV_RECIPIENTS` fallback: the last-resort floor for sends with
 *     no actor *and* no pin (headless cron / anonymization). Interactive
 *     logged-out testing should arm a pin instead of relying on this list.
 */
export function resolveMailRouting(
  control?: DevRedirectControl,
): OutboundRouting {
  return resolveOutboundRouting(
    control,
    [
      currentDevRedirectEmails,
      () => {
        const actor = currentActorEmail();
        return actor ? [actor] : null;
      },
      () => recipientList(EMAIL_DEV_RECIPIENTS),
    ],
    'outbound trapped (OUTBOUND_MODE != real) but no dev mail destination resolved, arm a login-redirect pin (settings dialog), set a personal redirect list, or set EMAIL_DEV_RECIPIENTS',
  );
}

/**
 * The mail dev-redirect destination for a *bulk* send attributed to one staff
 * member on a trapped env: their configured personal `devRedirectEmails`, or
 * their login email as the fallback when they haven't set one. Returns `[]`
 * only when neither is known.
 *
 * Unlike `resolveMailRouting`, this reads an explicit staff record rather
 * than the ambient request context: a broadcast send runs in the worker, long
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
