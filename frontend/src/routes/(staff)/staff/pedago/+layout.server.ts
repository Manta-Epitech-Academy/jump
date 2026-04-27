import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { getStaffRoleRedirectPath } from '$lib/domain/staff';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { applyStaffRoleGate, hasFlag } from '$lib/server/auth/guards';
import { resolveStageContext } from '$lib/server/services/stageContext';

export const load: LayoutServerLoad = async ({ parent, locals, url }) => {
  const { user, staffProfile } = await parent();

  if (!user) {
    throw redirect(302, resolve('/staff/login'));
  }

  const role = staffProfile?.staffRole;
  if (role !== 'peda' && role !== 'manta') {
    const target = getStaffRoleRedirectPath(role);
    throw redirect(302, resolve(target ?? '/staff/login'));
  }

  applyStaffRoleGate(locals, url.pathname);

  const db = scopedPrisma(getCampusId(locals));
  const activeStage = hasFlag(locals, 'stage_seconde')
    ? await resolveStageContext(db)
    : null;

  return {
    user,
    staffProfile,
    viewMode: locals.viewMode,
    activeStage,
  };
};
