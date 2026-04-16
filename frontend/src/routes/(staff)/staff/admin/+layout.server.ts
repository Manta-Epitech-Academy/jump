import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';

export const load: LayoutServerLoad = async ({ parent }) => {
  const { user } = await parent();

  // Final server-side security check for this area
  if (!user || user.role !== 'admin') {
    throw redirect(302, resolve('/staff/admin/login'));
  }

  return { user };
};
