import { OUTBOUND_MODE } from '$app/env/private';
import { currentArmedRealSends } from '#lib/server/requestContext.ts';

/**
 * THE OUTBOUND GATE: the single, environment-bound switch that decides whether
 * outbound transactional comms (email **and** SMS) may reach real recipients.
 *
 * Two properties make this the safety floor for a platform that messages minors
 * (RGPD):
 *
 *   1. **Fail-safe.** The default is `redirect` (trapped). Reaching real people
 *      requires an *explicit* `OUTBOUND_MODE=real`; anything else (unset, a
 *      typo, an empty string) resolves to `redirect`. So a forgotten or
 *      mis-set var never mails/texts a minor. The worst failure is real users
 *      not getting mail, never the reverse. Production is the *only* place that
 *      opts into `real`, on purpose.
 *
 *   2. **Environment-bound, immutable from the app.** It's an env var, not a DB
 *      flag, because it's the one signal that must track the *environment*
 *      rather than the *data*. A DB-stored gate would ride a `pg_dump` from prod
 *      into staging and either un-trap staging or trap prod; the running app
 *      also can't flip an env var, so it can never start sending for real on its
 *      own.
 *
 * This is deliberately ONE switch for both channels. The previous design gated
 * each channel on its own recipient list (`EMAIL_DEV_RECIPIENTS` /
 * `SMS_DEV_RECIPIENTS`), which let you trap email while SMS quietly went to real
 * numbers if you set one var and forgot the other. Those lists are now pure
 * *fallback destinations* (where a trapped copy lands), never the gate.
 */
type OutboundMode = 'real' | 'redirect';

function outboundMode(): OutboundMode {
  return OUTBOUND_MODE?.trim().toLowerCase() === 'real' ? 'real' : 'redirect';
}

/** Whether outbound is trapped (redirected away from real recipients). */
export function outboundTrapped(): boolean {
  return outboundMode() === 'redirect';
}

/**
 * Where a single send should go, once the per-channel resolver has walked its
 * destination ladder. A tagged union so the façade can't accidentally conflate
 * "deliver for real" with "trapped but nowhere to land":
 *
 *   - `real`     - deliver to the real recipient (prod, or a deliberate bypass /
 *                  armed real-send).
 *   - `redirect` - trapped: deliver to `to` instead (debug inboxes / numbers).
 *   - `drop`     - trapped, but no safe destination resolved. The send is NOT
 *                  delivered: dropping is the fail-closed choice, since the only
 *                  alternative would be reaching a real recipient. Surfaced as a
 *                  permanent failure so it's loud, not silent.
 */
export type OutboundRouting =
  | { kind: 'real' }
  | { kind: 'redirect'; to: string[] }
  | { kind: 'drop'; reason: string };

/**
 * Per-send dev-redirect destination control, the same for mail and SMS.
 * Consulted ONLY when the gate traps outbound: a no-op in prod, so it can never
 * misroute a real send.
 *
 *   - omitted   → the channel's own destination ladder (system / automatic sends)
 *   - string[]  → redirect to these addresses or numbers instead (e.g. the
 *                 staff member who triggered a bulk send, so copies land with
 *                 them)
 *   - 'bypass'  → no redirect; reach the real recipient. Reserve for a single,
 *                 explicit, human-typed test-send: never a cohort send.
 */
export type DevRedirectControl = readonly string[] | 'bypass';

export interface SendOptions {
  devRedirect?: DevRedirectControl;
}

/**
 * Where one destination of a channel's ladder would send a trapped copy, or
 * nothing (`null` or empty) when it has no answer for this send.
 */
export type DevDestination = () => readonly string[] | null;

/**
 * Resolve where one send goes, the same way for both channels: each channel
 * only supplies the destinations it can redirect to, in priority order, and
 * the reason it gives when none resolves.
 *
 * `{ kind: 'real' }` (deliver to the real recipient) in exactly these cases:
 *   - the gate is off (prod): `control` is ignored entirely, so a stray
 *     `'bypass'` or override can never escape a real send to debug addresses;
 *   - the gate is on but `control === 'bypass'`: the explicit single-recipient
 *     test-send escape (the human typed the destination, so honour it);
 *   - armed real sends (`armRealSends.ts`): the acting human has deliberately
 *     lifted the trap for their session.
 *
 * Otherwise `{ kind: 'redirect', to }`: a non-empty `string[]` control first,
 * then the channel's destinations in order. If trapped and none resolves, it is
 * `{ kind: 'drop' }`: the send is suppressed rather than leaked to the real
 * recipient (fail-closed).
 *
 * This head used to be written once per channel, and an escape added to one
 * would have let that channel reach real recipients where the other did not.
 */
export function resolveOutboundRouting(
  control: DevRedirectControl | undefined,
  destinations: readonly DevDestination[],
  dropReason: string,
): OutboundRouting {
  if (!outboundTrapped()) return { kind: 'real' };
  if (control === 'bypass') return { kind: 'real' };
  if (currentArmedRealSends()) return { kind: 'real' };
  if (Array.isArray(control) && control.length > 0) {
    return { kind: 'redirect', to: [...control] };
  }
  for (const destination of destinations) {
    const to = destination();
    if (to && to.length > 0) return { kind: 'redirect', to: [...to] };
  }
  return { kind: 'drop', reason: dropReason };
}

/** A comma-separated recipients env var as a list, or `null` when it holds none. */
export function recipientList(raw: string | undefined): string[] | null {
  const list = (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : null;
}
