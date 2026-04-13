import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { resolve } from '$app/paths';

export const load: PageServerLoad = async ({ params, locals }) => {
  const db = scopedPrisma(getCampusId(locals));

  const event = await db.event
    .findUniqueOrThrow({
      where: { id: params.id },
      include: { theme: true },
    })
    .catch(() => {
      throw error(404, 'Événement introuvable');
    });

  const planning = await db.planning.findFirst({
    where: { eventId: params.id },
    include: {
      timeSlots: {
        orderBy: { startTime: 'asc' },
        include: {
          activities: {
            where: { activityType: 'orga' },
          },
        },
      },
    },
  });

  const orgaActivities =
    planning?.timeSlots.flatMap((ts) =>
      ts.activities.map((a) => ({
        id: a.id,
        nom: a.nom,
        slotLabel: ts.label,
        startTime: ts.startTime,
        endTime: ts.endTime,
      })),
    ) ?? [];

  if (orgaActivities.length === 0) {
    throw error(404, 'Aucune activité orga trouvée pour cet événement');
  }

  if (orgaActivities.length === 1) {
    throw redirect(
      302,
      resolve(`/events/${params.id}/appel/${orgaActivities[0].id}`),
    );
  }

  return { event, orgaActivities };
};
