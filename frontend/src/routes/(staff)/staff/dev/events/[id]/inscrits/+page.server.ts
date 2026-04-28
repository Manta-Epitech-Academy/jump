import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
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
import { loadEventOr404 } from '$lib/server/services/stageContext';

export const load: PageServerLoad = async ({ params, locals }) => {
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(params.id, campusId);
  const db = scopedPrisma(campusId);

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

    const campusId = getCampusId(locals);
    await loadEventOr404(params.id, campusId);

    const talent = await prisma.talent.findUnique({
      where: { id: form.data.studentId },
      select: { id: true },
    });
    if (!talent) {
      return message(form, 'Talent introuvable.', { status: 400 });
    }

    const db = scopedPrisma(campusId);
    const existing = await db.participation.findUnique({
      where: {
        talentId_eventId: {
          talentId: form.data.studentId,
          eventId: params.id,
        },
      },
    });
    if (existing) {
      return message(form, 'Ce Talent est déjà inscrit à cet événement.', {
        status: 400,
      });
    }

    try {
      await db.participation.create({
        data: {
          talentId: form.data.studentId,
          eventId: params.id,
          campusId,
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

  toggleBringPc: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devMember');
    const data = await request.formData();
    return toggleBringPc(data, getCampusId(locals), params.id);
  },

  remove: async ({ url, locals, params }) => {
    requireStaffGroup(locals, 'devMember');
    const id = url.searchParams.get('id');
    if (!id) return fail(400);
    const db = scopedPrisma(getCampusId(locals));

    try {
      const p = await db.participation.findFirstOrThrow({
        where: { id, eventId: params.id },
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
