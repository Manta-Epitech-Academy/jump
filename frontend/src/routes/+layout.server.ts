import type { LayoutServerLoad } from './$types';
import { isTalentImpersonation } from '$lib/server/talentPlanningPreview';

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    user: locals.user,
    session: locals.session,
    staffProfile: locals.staffProfile,
    talent: locals.talent,
    // Resolved in hooks.server.ts alongside the feature-flag campus scope.
    talentCampusName: locals.talentCampusName,
    impersonator: locals.impersonator,
    // Drives the global "real sends armed" banner (dev/staging only).
    armedRealSends: locals.armedRealSends,
    armedRealSendsUntil: locals.armedRealSendsUntil,
    // Dev-tooling: the talent impersonation banner reads these to render its
    // planning-preview toggle (active state + whether the toggle applies).
    planningPreview: locals.planningPreview,
    canPreviewPlanning: isTalentImpersonation(locals),
  };
};
