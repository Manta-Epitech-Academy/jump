import { env } from '$env/dynamic/private';

/**
 * THE OUTBOUND GATE — the single, environment-bound switch that decides whether
 * outbound transactional comms (email **and** SMS) may reach real recipients.
 *
 * Two properties make this the safety floor for a platform that messages minors
 * (RGPD):
 *
 *   1. **Fail-safe.** The default is `redirect` (trapped). Reaching real people
 *      requires an *explicit* `OUTBOUND_MODE=real`; anything else — unset, a
 *      typo, an empty string — resolves to `redirect`. So a forgotten or
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
  return env.OUTBOUND_MODE?.trim().toLowerCase() === 'real'
    ? 'real'
    : 'redirect';
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
 *   - `real`     — deliver to the real recipient (prod, or a deliberate bypass /
 *                  armed real-send).
 *   - `redirect` — trapped: deliver to `to` instead (debug inboxes / numbers).
 *   - `drop`     — trapped, but no safe destination resolved. The send is NOT
 *                  delivered: dropping is the fail-closed choice, since the only
 *                  alternative would be reaching a real recipient. Surfaced as a
 *                  permanent failure so it's loud, not silent.
 */
export type OutboundRouting =
  | { kind: 'real' }
  | { kind: 'redirect'; to: string[] }
  | { kind: 'drop'; reason: string };
