import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prisma } from '$lib/server/db';
import { countUnreadForAdmin } from '$lib/server/services/tickets';
import { staffDevRedirectSchema } from '$lib/validation/staffSettings';
import { outboundTrapped } from '$lib/server/outbound';
import { canArmRealSends } from '$lib/server/armRealSends';

export const load: LayoutServerLoad = async ({ parent, locals }) => {
  const { user, staffProfile } = await parent();

  if (!user || staffProfile?.staffRole !== 'admin') {
    throw redirect(302, resolve('/staff/login'));
  }

  const [ticketsUnread, deletionRequestsPending, settingsForm] =
    await Promise.all([
      countUnreadForAdmin(),
      prisma.talentDeletionRequest.count({ where: { status: 'pending' } }),
      superValidate(
        {
          devRedirectEmails: staffProfile.devRedirectEmails.join('\n'),
          devRedirectPhones: staffProfile.devRedirectPhones.join('\n'),
        },
        zod4(staffDevRedirectSchema),
      ),
    ]);

  return {
    user,
    staffProfile,
    ticketsUnread,
    deletionRequestsPending,
    // Powers the settings dialog opened from the profile dropdown. The
    // dev-redirect controls are admin-only, so they live in the admin layout
    // (there is no standalone /staff/settings page).
    settingsForm,
    outboundTrapped: outboundTrapped(),
    canArmRealSends: canArmRealSends(locals),
    armedRealSends: locals.armedRealSends,
    armedRealSendsUntil: locals.armedRealSendsUntil,
  };
};
