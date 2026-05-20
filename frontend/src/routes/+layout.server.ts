import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    user: locals.user,
    session: locals.session,
    staffProfile: locals.staffProfile,
    talent: locals.talent,
    // Resolved in hooks.server.ts alongside the feature-flag campus scope.
    talentCampusName: locals.talentCampusName,
    impersonator: locals.impersonator,
  };
};
