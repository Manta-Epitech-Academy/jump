import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { toggleBringPc } from '$lib/server/actions/toggleBringPc';
import { prisma } from '$lib/server/db';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { requireFlag, requireStaffGroup } from '$lib/server/auth/guards';
import { loadStageOr404 } from '$lib/server/services/stageContext';

export const load: PageServerLoad = async ({ params, locals }) => {
  requireFlag(locals, 'stage_seconde');
  const campusId = getCampusId(locals);
  const event = await loadStageOr404(params.id, campusId);
  const db = scopedPrisma(campusId);

  const participations = await db.participation.findMany({
    where: { eventId: event.id },
    include: { talent: true, stageCompliance: true },
    orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
  });

  return { event, participations };
};

export const actions: Actions = {
  toggleAdminDoc: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devMember');
    const campusId = getCampusId(locals);
    await loadStageOr404(params.id, campusId);
    const data = await request.formData();
    const id = data.get('id') as string;
    const docType = data.get('docType') as string;
    const currentState = data.get('state') === 'true';
    const newState = !currentState;
    const db = scopedPrisma(campusId);

    try {
      await db.participation.findUniqueOrThrow({
        where: { id, eventId: params.id },
        select: { id: true },
      });

      const updateData: { [key: string]: boolean } = {};
      if (docType === 'charte') updateData.charteSigned = newState;
      if (docType === 'convention') updateData.conventionSigned = newState;
      if (docType === 'image') updateData.imageRightsSigned = newState;

      await prisma.stageCompliance.upsert({
        where: { participationId: id },
        create: { participationId: id, ...updateData },
        update: updateData,
      });
      return { success: true };
    } catch {
      return fail(500, { error: 'Erreur de mise à jour' });
    }
  },

  toggleBringPc: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devMember');
    const campusId = getCampusId(locals);
    await loadStageOr404(params.id, campusId);
    const data = await request.formData();
    return toggleBringPc(data, campusId);
  },
};
