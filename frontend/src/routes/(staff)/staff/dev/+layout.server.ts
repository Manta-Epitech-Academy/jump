import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { getCampusTimezone } from '$lib/server/db/scoped';

export const load: LayoutServerLoad = async ({ parent, locals }) => {
  const { user, staffProfile } = await parent();

  if (!user) {
    throw redirect(302, resolve('/staff/login'));
  }

  return { user, staffProfile, timezone: getCampusTimezone(locals) };
};
