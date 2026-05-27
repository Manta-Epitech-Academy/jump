import type { LayoutServerLoad } from './$types';
import type { BroadcastChannel } from '@prisma/client';
import {
  parseDevRecipients as parseEmailDevRecipients,
  staffBulkDevRedirectEmails,
} from '$lib/server/email/dev-redirect';
import { parseDevRecipients as parseSmsDevRecipients } from '$lib/server/sms/dev-redirect';

/** Where a trapped *bulk* send on one channel lands, for the broadcast banner. */
export type DevRedirect = {
  channel: BroadcastChannel;
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
};

/**
 * Surface the active dev-redirect trap (mail and/or SMS) to the broadcast UI so
 * admins know where their *bulk* sends will land before sending. Both channels
 * carry messages meant for minors and their parents (RGPD), so the trap must
 * never be silent.
 *
 * Note the asymmetry the banner has to convey honestly:
 *   - test sends bypass the trap entirely (they reach the address you type);
 *   - bulk mail routes to the composer's own inbox (the future broadcast
 *     creator), so testers don't cross-pollute each other;
 *   - bulk SMS falls back to the shared `SMS_DEV_RECIPIENTS` list, because
 *     staff accounts have no phone to redirect to.
 *
 * One more state the banner must not get wrong: while the composer has *armed
 * real sends* (see `$lib/server/armRealSends`), bulk sends bypass the trap and
 * reach real recipients. `armedRealSends` is surfaced so the layout can flip
 * the "trapped" message to a danger one instead of claiming the cohort is safe.
 */
export const load: LayoutServerLoad = ({ locals }) => {
  const devRedirects: DevRedirect[] = [];

  // Mail trap active → bulk copies route to the composer (the eventual
  // broadcast creator). Share the exact rule the send uses via
  // `staffBulkDevRedirectEmails`, so the banner names where copies actually
  // land rather than a guess that could drift from `orchestrator.ts`.
  const emailTrap = parseEmailDevRecipients();
  if (emailTrap) {
    const mailTo = staffBulkDevRedirectEmails(
      locals.staffProfile?.devRedirectEmails,
      locals.user?.email,
    );
    if (mailTo.length > 0)
      devRedirects.push({
        channel: 'mail',
        recipients: mailTo,
        prefixExample: '[→ original@…]',
        scope: 'self',
      });
  }

  const smsTrap = parseSmsDevRecipients();
  if (smsTrap)
    devRedirects.push({
      channel: 'sms',
      recipients: smsTrap,
      prefixExample: '[-> +33…]',
      scope: 'shared',
    });

  return { devRedirects, armedRealSends: locals.armedRealSends };
};
