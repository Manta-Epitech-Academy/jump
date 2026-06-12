import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/db';

// Admin is campus-agnostic: list every talent that carries a staff note, across
// all campuses. Only the fields the cards render are selected (never the rest of
// the Talent row).
export const load: PageServerLoad = async () => {
  const talents = await prisma.talent.findMany({
    where: { AND: [{ note: { not: null } }, { note: { not: '' } }] },
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    select: { id: true, prenom: true, nom: true, note: true },
  });

  return { talents };
};
