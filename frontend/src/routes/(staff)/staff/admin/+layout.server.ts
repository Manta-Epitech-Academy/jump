import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prisma } from '$lib/server/db';
import { countAuthIdentityConflicts } from '$lib/server/services/authIdentityService';
import { staffDevRedirectSchema } from '$lib/validation/staffSettings';
import { createApiTokenSchema } from '$lib/validation/adminApiToken';
import { outboundTrapped } from '$lib/server/outbound';
import { canArmRealSends } from '$lib/server/armRealSends';
import { staffBulkDevRedirectEmails } from '$lib/server/email/dev-redirect';
import { listTokens, DAILY_CALL_QUOTA } from '$lib/server/adminApi/tokens';

export const load: LayoutServerLoad = async ({ parent, locals }) => {
  const { user, staffProfile } = await parent();

  if (!user || staffProfile?.staffRole !== 'admin') {
    throw redirect(302, resolve('/staff/login'));
  }

  const [
    deletionRequestsPending,
    authConflictsPending,
    settingsForm,
    apiTokenForm,
  ] = await Promise.all([
    prisma.talentDeletionRequest.count({ where: { status: 'pending' } }),
    countAuthIdentityConflicts(),
    superValidate(
      {
        devRedirectEmails: staffProfile.devRedirectEmails.join('\n'),
        devRedirectPhones: staffProfile.devRedirectPhones.join('\n'),
      },
      zod4(staffDevRedirectSchema),
    ),
    superValidate(zod4(createApiTokenSchema)),
  ]);

  return {
    user,
    staffProfile,
    deletionRequestsPending,
    authConflictsPending,
    // Powers the settings dialog opened from the profile dropdown. The
    // dev-redirect controls are admin-only, so they live in the admin layout
    // (there is no standalone /staff/settings page).
    settingsForm,
    // Same pattern for the API-tokens dialog (also opened from the dropdown,
    // also backed by an action-only route). The token list is streamed rather
    // than awaited: nothing in the admin chrome needs it, so a page must not
    // wait on it to paint. The dialog awaits it when it opens.
    apiTokenForm,
    apiTokens: listTokens(user.id),
    apiTokenDailyQuota: DAILY_CALL_QUOTA,
    outboundTrapped: outboundTrapped(),
    canArmRealSends: canArmRealSends(locals),
    armedRealSends: locals.armedRealSends,
    armedRealSendsUntil: locals.armedRealSendsUntil,
    // The pin is only ever set on a logged-out request, so it's normally null
    // here; the dialog uses it to show "actif" when an admin re-opens settings
    // in another (still logged-in) tab, and otherwise previews the destination.
    devRedirectPin: locals.devRedirectPin,
    // Where a pin would route login mail, computed with the same helper the live
    // routing uses, so the dialog's preview matches reality.
    devRedirectPinTo: staffBulkDevRedirectEmails(
      staffProfile.devRedirectEmails,
      user.email ?? null,
    ),
  };
};
