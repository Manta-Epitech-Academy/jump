import type { PageServerLoad } from './$types';
import { requireParentSession } from '#lib/server/auth/guards.ts';

export const load: PageServerLoad = async ({ locals }) => {
  requireParentSession(locals);

  return {
    parentName: locals.user.name ?? '',
    email: locals.user.email,
  };
};
