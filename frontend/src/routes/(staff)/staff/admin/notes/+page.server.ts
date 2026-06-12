import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/db';

// Admin is campus-agnostic: list every talent that carries a staff note, across
// all campuses. Only the fields the cards render are selected (never the rest of
// the Talent row).
export const load: PageServerLoad = async () => {
  const talents = await prisma.talent.findMany({
    where: { AND: [{ note: { not: null } }, { note: { not: '' } }] },
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    select: {
      id: true,
      prenom: true,
      nom: true,
      note: true,
      // Effective campus = most-recent participation's campus (talents have no
      // direct Campus FK), same resolution as the other admin talent views. It
      // disambiguates same-name talents across campuses on this global list.
      participations: {
        take: 1,
        orderBy: { event: { date: 'desc' } },
        select: { campus: { select: { name: true } } },
      },
    },
  });

  return {
    talents: talents.map((t) => ({
      id: t.id,
      prenom: t.prenom,
      nom: t.nom,
      note: t.note,
      campus: t.participations[0]?.campus?.name ?? null,
    })),
  };
};
