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
import { resolveWorkspaceEvents } from '$lib/server/services/stageContext';
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
  const timezone = getCampusTimezone(locals);
  const phaseOverride = locals.stagePhaseOverride;
  // Independent shell side-effects, fired in one wave rather than stacked as
  // three sequential round-trips on every dev navigation. `workspace` lists the
  // campus's events (those with at least one module) for the sidebar switcher;
  // the sync-errors guard still short-circuits to a constant when its flag is off.
  const [workspace, ticketsUnread, syncErrorCounts] = await Promise.all([
    resolveWorkspaceEvents(db, timezone),
    locals.ticketsEnabled ? countUnreadForAuthor(user.id) : 0,
    staffProfile?.campusId && hasFlag(locals, 'staff_sync_errors')
      ? countCampusSyncErrors(staffProfile.campusId)
      : { total: 0, urgent: 0 },
  ]);

  return {
    user,
    staffProfile,
    timezone,
    workspace,
    ticketsUnread,
    syncErrorCounts,
    phaseOverride,
    canOverridePhase: isDevImpersonation(locals),
    // Real phase of the event the workspace lands on, for the impersonation
    // phase-preview toggle (ImpersonationCard reads `realPhase`). Successor to
    // the removed `activeStage.realStatus` now that the workspace is multi-event.
    realPhase: workspace.current?.status ?? null,
  };
};
