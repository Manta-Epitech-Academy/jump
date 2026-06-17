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
    // Drives the global "login mail redirected to me" banner, shown on
    // logged-out pages too (the pin is for testing the logged-out OTP flow).
    devRedirectPin: locals.devRedirectPin,
    // Dev-tooling: the talent impersonation banner reads these to render its
    // planning-preview toggle (active state + whether the toggle applies).
    planningPreview: locals.planningPreview,
    canPreviewPlanning: isTalentImpersonation(locals),
  };
};
