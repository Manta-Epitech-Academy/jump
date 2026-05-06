import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { countUnreadForAdmin } from '$lib/server/services/tickets';

export const load: LayoutServerLoad = async ({ parent }) => {
  const { user, staffProfile } = await parent();

  if (!user || staffProfile?.staffRole !== 'admin') {
    throw redirect(302, resolve('/staff/login'));
  }

  const ticketsUnread = await countUnreadForAdmin();

  return { user, staffProfile, ticketsUnread };
};
