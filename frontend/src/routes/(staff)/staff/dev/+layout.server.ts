import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { getStaffRoleRedirectPath } from '$lib/domain/staff';
import { applyStaffRoleGate } from '$lib/server/auth/guards';
import { resolveWorkspaceEvents } from '$lib/server/services/stageContext';
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
