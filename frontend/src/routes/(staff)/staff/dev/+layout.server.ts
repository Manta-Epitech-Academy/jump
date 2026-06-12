import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { getStaffRoleRedirectPath } from '$lib/domain/staff';
import { applyStaffRoleGate, hasFlag } from '$lib/server/auth/guards';
import { resolveStageContext } from '$lib/server/services/stageContext';
import { countUnreadForAuthor } from '$lib/server/services/tickets';
import { countCampusSyncErrors } from '$lib/server/services/syncErrors';
import { isDevImpersonation } from '$lib/server/devPhaseOverride';

export const load: LayoutServerLoad = async ({ parent, locals, url }) => {
  const { user, staffProfile } = await parent();

  if (!user) {
    throw redirect(302, resolve('/staff/login'));
  }

  const role = staffProfile?.staffRole;

  if (role !== 'superdev' && role !== 'dev') {
    const target = getStaffRoleRedirectPath(role);
    throw redirect(302, resolve(target ?? '/staff/login'));
  }

  applyStaffRoleGate(locals, url.pathname);

  const db = scopedPrisma(getCampusId(locals));
  const phaseOverride = locals.stagePhaseOverride;
  // Independent shell side-effects, fired in one wave rather than stacked as
  // three sequential round-trips on every dev navigation. Each guard still
  // short-circuits to a constant when its flag is off.
  const [activeStage, ticketsUnread, syncErrorCounts] = await Promise.all([
    hasFlag(locals, 'stage_seconde')
      ? resolveStageContext(db, { phaseOverride })
      : null,
    locals.ticketsEnabled ? countUnreadForAuthor(user.id) : 0,
    staffProfile?.campusId && hasFlag(locals, 'staff_sync_errors')
      ? countCampusSyncErrors(staffProfile.campusId)
      : { total: 0, urgent: 0 },
  ]);

  return {
    user,
    staffProfile,
    timezone: getCampusTimezone(locals),
    activeStage,
    ticketsUnread,
    syncErrorCounts,
    phaseOverride,
    canOverridePhase: isDevImpersonation(locals),
  };
};
