import type { PageServerLoad } from './$types';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { imageRightsStatus } from '$lib/domain/imageRights';

export const load: PageServerLoad = async ({ parent, locals }) => {
  const { activeStage } = await parent();

  if (!activeStage) {
    return { stage: null, talents: [] };
  }

  const db = scopedPrisma(getCampusId(locals));
  const participations = await db.participation.findMany({
    where: { eventId: activeStage.id },
    select: {
      talent: {
        select: {
          id: true,
          prenom: true,
          nom: true,
          imageRightsDecision: true,
        },
      },
    },
    orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
  });

  const talents = participations.map((p) => ({
    id: p.talent.id,
    prenom: p.talent.prenom,
    nom: p.talent.nom,
    imageRefused: imageRightsStatus(p.talent) === 'refused',
  }));

  return {
    stage: { id: activeStage.id, titre: activeStage.titre },
    talents,
  };
};
