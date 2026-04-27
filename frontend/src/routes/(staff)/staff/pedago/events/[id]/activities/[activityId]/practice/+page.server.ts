import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/db';
import { requireStaffGroup } from '$lib/server/auth/guards';
import type { ActivityStructure } from '$lib/server/services/progressService';

export const load: PageServerLoad = async ({ locals, params }) => {
  requireStaffGroup(locals, 'pedaMember');

  const activity = await prisma.activity.findUnique({
    where: { id: params.activityId },
    include: {
      timeSlot: {
        include: {
          planning: { select: { eventId: true } },
        },
      },
    },
  });

  if (!activity) throw error(404, 'Activité introuvable');

  const eventId = activity.timeSlot?.planning?.eventId;
  if (eventId !== params.id) {
    throw error(404, 'Activité non rattachée à cet événement.');
  }

  if (!activity.isDynamic) {
    throw error(
      404,
      "L'entraînement n'est disponible que pour les activités dynamiques.",
    );
  }

  const structure = (activity.contentStructure as ActivityStructure | null) ?? {
    steps: [],
  };
  if (!structure.steps || structure.steps.length === 0) {
    throw error(404, "Cette activité dynamique n'a aucune étape configurée.");
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, titre: true },
  });

  if (!event) throw error(404, 'Événement introuvable');

  return { activity, event, steps: structure.steps };
};
