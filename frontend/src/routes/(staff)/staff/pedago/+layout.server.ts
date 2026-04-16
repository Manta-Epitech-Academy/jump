import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { getStaffRoleRedirectPath } from '$lib/domain/staff';

export const load: LayoutServerLoad = async ({ parent }) => {
  const { user, staffProfile } = await parent();

  if (!user) {
    throw redirect(302, resolve('/staff/login'));
  }

  const role = staffProfile?.staffRole;
  if (role !== 'peda' && role !== 'manta') {
    const target = getStaffRoleRedirectPath(role);
    throw redirect(302, resolve(target ?? '/staff/login'));
  }

  return { user, staffProfile };
};
