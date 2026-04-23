import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { getStaffRoleRedirectPath } from '$lib/domain/staff';
import { hasFlag } from '$lib/server/auth/guards';
import { resolveStageContext } from '$lib/server/services/stageContext';

export const load: LayoutServerLoad = async ({ parent, locals }) => {
  const { user, staffProfile } = await parent();

  if (!user) {
    throw redirect(302, resolve('/staff/login'));
  }

  const role = staffProfile?.staffRole;
  if (role !== 'superdev' && role !== 'dev') {
    const target = getStaffRoleRedirectPath(role);
    throw redirect(302, resolve(target ?? '/staff/login'));
  }

  const db = scopedPrisma(getCampusId(locals));
  const activeStage = hasFlag(locals, 'stage_seconde')
    ? await resolveStageContext(db)
    : null;

  return {
    user,
    staffProfile,
    timezone: getCampusTimezone(locals),
    activeStage,
  };
};
