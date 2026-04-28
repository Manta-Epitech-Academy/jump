import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { addParticipantSchema } from '$lib/validation/events';
import { getTotalXp, getXpEligibleActivities } from '$lib/domain/xp';
import { toggleBringPc } from '$lib/server/actions/toggleBringPc';
import { prisma } from '$lib/server/db';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';

export const load: PageServerLoad = async ({ params, locals }) => {
  const campusId = getCampusId(locals);
  const db = scopedPrisma(campusId);

  let event;
  try {
    event = await db.event.findUniqueOrThrow({
      where: { id: params.id },
      select: { id: true, titre: true, eventType: true, date: true },
    });
  } catch {
    throw error(404, 'Événement introuvable');
  }

  const participations = await db.participation.findMany({
    where: { eventId: event.id },
    include: { talent: true, stageCompliance: true },
    orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
  });

  const addForm = await superValidate(zod4(addParticipantSchema));

  return {
    event,
    participations,
    addForm,
    timezone: getCampusTimezone(locals),
  };
};

export const actions: Actions = {
  addExisting: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devMember');
    const form = await superValidate(request, zod4(addParticipantSchema));
    if (!form.valid) return fail(400, { form });
    try {
      const existing = await prisma.participation.findUnique({
        where: {
          talentId_eventId: {
            talentId: form.data.studentId,
            eventId: params.id,
          },
        },
      });
      if (existing)
        return message(form, 'Ce Talent est déjà inscrit à cet événement.', {
          status: 400,
        });
      await prisma.participation.create({
        data: {
          talentId: form.data.studentId,
          eventId: params.id,
          campusId: getCampusId(locals),
          isPresent: false,
        },
      });
      return message(form, 'Talent ajouté !');
    } catch {
      return message(form, "Erreur technique lors de l'ajout.", {
        status: 500,
      });
    }
  },

  toggleBringPc: async ({ request, locals }) => {
    requireStaffGroup(locals, 'devMember');
    const data = await request.formData();
    return toggleBringPc(data, getCampusId(locals));
  },

  remove: async ({ url, locals }) => {
    requireStaffGroup(locals, 'devMember');
    const id = url.searchParams.get('id');
    if (!id) return fail(400);
    const db = scopedPrisma(getCampusId(locals));

    try {
      const p = await db.participation.findUniqueOrThrow({
        where: { id },
        include: { activities: { include: { activity: true } } },
      });

      if (p.isPresent) {
        const xpValue = getTotalXp(getXpEligibleActivities(p.activities));
        const profile = await prisma.talent.findUniqueOrThrow({
          where: { id: p.talentId },
          select: { xp: true, eventsCount: true },
        });
        await prisma.talent.update({
          where: { id: p.talentId },
          data: {
            xp: Math.max(0, profile.xp - xpValue),
            eventsCount: Math.max(0, profile.eventsCount - 1),
          },
        });
      }

      await prisma.participation.delete({ where: { id } });
      return { success: true };
    } catch {
      return fail(500);
    }
  },
};
