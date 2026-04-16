import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';

export const load: LayoutServerLoad = async ({ parent }) => {
  const { user, staffProfile } = await parent();

  if (
    !user ||
    (user.role !== 'admin' && staffProfile?.staffRole !== 'admin')
  ) {
    throw redirect(302, resolve('/staff/admin/login'));
  }

  return { user, staffProfile };
};
