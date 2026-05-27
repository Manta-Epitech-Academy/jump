import type { LayoutServerLoad } from './$types';
import type { BroadcastChannel } from '@prisma/client';
import { staffBulkDevRedirectEmails } from '$lib/server/email/dev-redirect';
import {
  parseDevRecipients as parseSmsDevRecipients,
  staffBulkDevRedirectPhones,
} from '$lib/server/sms/dev-redirect';
import { outboundTrapped } from '$lib/server/outbound';

/** Where a trapped *bulk* send on one channel lands, for the broadcast banner. */
export type DevRedirect =
  | {
      channel: BroadcastChannel;
      /** Trapped copies are redirected to a debug destination. */
      status: 'redirect';
      /** Effective destination of a trapped bulk send on this channel. */
      recipients: string[];
      /** Example of how the intended recipient is prepended on each message. */
      prefixExample: string;
      /**
       * `self` — copies land in the composer's own inbox (mail routes to the
       * broadcast creator). `shared` — copies go to the shared env debug list
       * (SMS, since staff accounts carry no phone to redirect to).
       */
      scope: 'self' | 'shared';
    }
  | {
      channel: BroadcastChannel;
      /**
       * Trapped, but no destination resolved → the bulk send will be *dropped*
       * (fail-closed; never leaked to real recipients). Tells the admin to
       * configure a destination before sending on this channel.
       */
      status: 'dropped';
    };

/**
 * Surface the outbound trap (mail + SMS) to the broadcast UI so admins know
 * where their *bulk* sends will land before sending. Both channels carry
 * messages meant for minors and their parents (RGPD), so the trap must never be
 * silent. Gated by `OUTBOUND_MODE` (`$lib/server/outbound`) — one switch, both
 * channels, so the banner can't claim "trapped" for one while the other leaks.
 *
 * The asymmetry the banner has to convey honestly:
 *   - test sends bypass the trap entirely (they reach the address you type);
 *   - bulk mail routes to the composer's own inbox (the future broadcast
 *     creator), so testers don't cross-pollute each other;
 *   - bulk SMS falls back to the shared `SMS_DEV_RECIPIENTS` list (staff
 *     accounts have no phone to redirect to), and is *dropped* if that's unset.
 *
 * One more state the banner must not get wrong: while the composer has *armed
 * real sends* (see `$lib/server/armRealSends`), bulk sends bypass the trap and
 * reach real recipients. `armedRealSends` is surfaced so the layout can flip
 * the "trapped" message to a danger one instead of claiming the cohort is safe.
 */
export const load: LayoutServerLoad = ({ locals }) => {
  const devRedirects: DevRedirect[] = [];

  if (outboundTrapped()) {
    // Mail bulk → the composer (the eventual broadcast creator). Share the exact
    // rule the send uses (`staffBulkDevRedirectEmails`) so the banner names
    // where copies actually land rather than a guess that could drift from
    // `orchestrator.ts`. Resolves for any admin composer (login email), so it
    // effectively never drops — but model that case anyway for honesty.
    const mailTo = staffBulkDevRedirectEmails(
      locals.staffProfile?.devRedirectEmails,
      locals.user?.email,
    );
    devRedirects.push(
      mailTo.length > 0
        ? {
            channel: 'mail',
            status: 'redirect',
            recipients: mailTo,
            prefixExample: '[→ original@…]',
            scope: 'self',
          }
        : { channel: 'mail', status: 'dropped' },
    );

    // SMS bulk: mirror mail — route to the composer's configured phones
    // (`scope: 'self'`), since the page viewer is the eventual creator and the
    // send resolves the same phones off their row. With no personal phone, fall
    // back to the shared `SMS_DEV_RECIPIENTS` list (`scope: 'shared'`) — or drop
    // if that's empty too. No login-phone fallback: staff carry no login phone.
    const smsSelf = staffBulkDevRedirectPhones(
      locals.staffProfile?.devRedirectPhones,
    );
    const smsEnv = parseSmsDevRecipients();
    devRedirects.push(
      smsSelf.length > 0
        ? {
            channel: 'sms',
            status: 'redirect',
            recipients: smsSelf,
            prefixExample: '[-> +33…]',
            scope: 'self',
          }
        : smsEnv
          ? {
              channel: 'sms',
              status: 'redirect',
              recipients: smsEnv,
              prefixExample: '[-> +33…]',
              scope: 'shared',
            }
          : { channel: 'sms', status: 'dropped' },
    );
  }

  return { devRedirects, armedRealSends: locals.armedRealSends };
};
