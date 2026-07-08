import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { getStaffRoleRedirectPath } from '$lib/domain/staff';
import { can } from '$lib/domain/permissions';
import { resolveWorkspaceEvents } from '$lib/server/services/stageContext';
import { isDevImpersonation } from '$lib/server/devPhaseOverride';

export const load: LayoutServerLoad = async ({ parent, locals }) => {
  const { user, staffProfile } = await parent();

  if (!user) {
    throw redirect(302, resolve('/staff/login'));
  }

  const role = staffProfile?.staffRole;

  if (!can('devMember', role)) {
    const target = getStaffRoleRedirectPath(role);
    throw redirect(302, resolve(target ?? '/staff/login'));
  }

  const db = scopedPrisma(getCampusId(locals));
  const timezone = getCampusTimezone(locals);
  const phaseOverride = locals.stagePhaseOverride;
  // `workspace` lists the campus's events (those with at least one module) for
  // the sidebar switcher.
  const workspace = await resolveWorkspaceEvents(db, timezone);

  return {
    user,
    staffProfile,
    timezone,
    workspace,
    phaseOverride,
    canOverridePhase: isDevImpersonation(locals),
    // Real phase of the event the workspace lands on, for the impersonation
    // phase-preview toggle (ImpersonationCard reads `realPhase`). Successor to
    // the removed `activeStage.realStatus` now that the workspace is multi-event.
    realPhase: workspace.current?.status ?? null,
  };
};
