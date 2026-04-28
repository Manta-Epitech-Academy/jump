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

// Maps form-side doc type identifiers to their Prisma column.
const DOC_TYPE_FIELDS = {
  charte: 'charteSigned',
  convention: 'conventionSigned',
  image: 'imageRightsSigned',
} as const;
type DocType = keyof typeof DOC_TYPE_FIELDS;

export const actions: Actions = {
  toggleAdminDoc: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devMember');
    const campusId = getCampusId(locals);
    await loadStageOr404(params.id, campusId);

    const data = await request.formData();
    const id = data.get('id');
    const docType = data.get('docType');
    const newState = data.get('state') !== 'true';

    if (typeof id !== 'string' || !id) {
      return fail(400, { error: 'Identifiant manquant' });
    }
    if (typeof docType !== 'string' || !(docType in DOC_TYPE_FIELDS)) {
      return fail(400, { error: 'Type de document invalide' });
    }

    const field = DOC_TYPE_FIELDS[docType as DocType];
    const db = scopedPrisma(campusId);

    try {
      await db.participation.findFirstOrThrow({
        where: { id, eventId: params.id },
        select: { id: true },
      });

      await prisma.stageCompliance.upsert({
        where: { participationId: id },
        create: { participationId: id, [field]: newState },
        update: { [field]: newState },
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
    return toggleBringPc(data, campusId, params.id);
  },
};
