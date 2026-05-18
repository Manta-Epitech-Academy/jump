import type { LayoutServerLoad } from './$types';
import { env } from '$env/dynamic/private';

/**
 * Surface the dev-recipient override to the broadcast UI so admins see a
 * warning before sending. The full list is shown — anyone with admin
 * access already has the prod env; surfacing it in-app removes the
 * "I thought we were in prod" foot-gun.
 */
export const load: LayoutServerLoad = () => {
  const raw = env.EMAIL_DEV_RECIPIENTS?.trim();
  const devRedirectRecipients = raw
    ? raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return {
    devRedirectActive: devRedirectRecipients.length > 0,
    devRedirectRecipients,
  };
};
