import type { LayoutServerLoad } from './$types';
import { prisma } from '$lib/server/db';

export const load: LayoutServerLoad = async ({ locals }) => {
  // Staff campus is already on `locals.staffProfile.campus`. Talents have no
  // direct Campus relation, so derive it from the most recent participation
  // (matches what `hooks.server.ts` does to scope feature flags). Only the
  // root layout exposes this name, used by analytics identify().
  let talentCampusName: string | null = null;
  if (locals.talent && !locals.staffProfile) {
    const participation = await prisma.participation.findFirst({
      where: { talentId: locals.talent.id },
      orderBy: { event: { date: 'desc' } },
      select: { campus: { select: { name: true } } },
    });
    talentCampusName = participation?.campus?.name ?? null;
  }

  return {
    user: locals.user,
    session: locals.session,
    staffProfile: locals.staffProfile,
    talent: locals.talent,
    talentCampusName,
  };
};
