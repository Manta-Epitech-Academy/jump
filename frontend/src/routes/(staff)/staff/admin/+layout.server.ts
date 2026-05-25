import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import { countUnreadForAdmin } from '$lib/server/services/tickets';

export const load: LayoutServerLoad = async ({ parent }) => {
  const { user, staffProfile } = await parent();

  if (!user || staffProfile?.staffRole !== 'admin') {
    throw redirect(302, resolve('/staff/login'));
  }

  const [ticketsUnread, deletionRequestsPending] = await Promise.all([
    countUnreadForAdmin(),
    prisma.talentDeletionRequest.count({ where: { status: 'pending' } }),
  ]);

  return { user, staffProfile, ticketsUnread, deletionRequestsPending };
};
