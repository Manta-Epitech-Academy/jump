import type { LayoutServerLoad } from './$types';
import type { BroadcastChannel } from '@prisma/client';
import { parseDevRecipients as parseEmailDevRecipients } from '$lib/server/email/dev-redirect';
import { parseDevRecipients as parseSmsDevRecipients } from '$lib/server/sms/dev-redirect';

/** One active dev-recipient override, surfaced to the broadcast UI banner. */
export type DevRedirect = {
  channel: BroadcastChannel;
  /** Env var that triggered the override, shown so staff can locate it. */
  envVar: string;
  recipients: string[];
  /** Example of how the intended recipient is prepended on each message. */
  prefixExample: string;
};

/**
 * Surface every active dev-recipient override (mail and SMS) to the broadcast
 * UI so admins see a warning before sending. Both channels reroute messages
 * meant for minors and their parents (RGPD), so neither override may be
 * silent — anyone with admin access already has the prod env, so showing the
 * lists in-app removes the "I thought we were in prod" foot-gun rather than
 * leaking anything.
 */
export const load: LayoutServerLoad = () => {
  const devRedirects: DevRedirect[] = [];

  const email = parseEmailDevRecipients();
  if (email)
    devRedirects.push({
      channel: 'mail',
      envVar: 'EMAIL_DEV_RECIPIENTS',
      recipients: email,
      prefixExample: '[→ original@…]',
    });

  const sms = parseSmsDevRecipients();
  if (sms)
    devRedirects.push({
      channel: 'sms',
      envVar: 'SMS_DEV_RECIPIENTS',
      recipients: sms,
      prefixExample: '[-> +33…]',
    });

  return { devRedirects };
};
