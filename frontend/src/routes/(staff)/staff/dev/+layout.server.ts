import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { getStaffRoleRedirectPath } from '$lib/domain/staff';
import {
  applyStaffRoleGate,
  DEV_INTERVIEWS_PATH_PATTERN,
  hasFlag,
} from '$lib/server/auth/guards';
import { can } from '$lib/domain/permissions';
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
  const isInterviewsPath = DEV_INTERVIEWS_PATH_PATTERN.test(url.pathname);
  const isInterviewerOnly =
    role !== 'superdev' &&
    role !== 'dev' &&
    isInterviewsPath &&
    can('interviewers', role);

  if (role !== 'superdev' && role !== 'dev' && !isInterviewerOnly) {
    const target = getStaffRoleRedirectPath(role);
    throw redirect(302, resolve(target ?? '/staff/login'));
  }

  applyStaffRoleGate(locals, url.pathname);

  const db = scopedPrisma(getCampusId(locals));
  const phaseOverride = locals.stagePhaseOverride;
  // Non-dev interviewers (peda, manta) only see the interviews route in this
  // workspace — skip the dev shell side effects (stage resolution, ticket
  // counts) and signal `devLayoutScope: 'interview-only'` so the layout
  // svelte strips sidebar/header chrome.
  const activeStage =
    !isInterviewerOnly && hasFlag(locals, 'stage_seconde')
      ? await resolveStageContext(db, { phaseOverride })
      : null;

  const ticketsUnread =
    !isInterviewerOnly && locals.ticketsEnabled
      ? await countUnreadForAuthor(user.id)
      : 0;

  const syncErrorCounts =
    !isInterviewerOnly && staffProfile?.campusId
      ? await countCampusSyncErrors(staffProfile.campusId)
      : { total: 0, urgent: 0 };

  return {
    user,
    staffProfile,
    timezone: getCampusTimezone(locals),
    activeStage,
    ticketsUnread,
    syncErrorCounts,
    phaseOverride,
    canOverridePhase: isDevImpersonation(locals),
    devLayoutScope: isInterviewerOnly
      ? ('interview-only' as const)
      : ('full' as const),
  };
};
