import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
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
        where: { activity: { activityType: 'orga' } },
        orderBy: { startTime: 'asc' },
        include: { activity: true },
      },
    },
  });

  const orgaActivities =
    planning?.timeSlots.flatMap((ts) =>
      ts.activity
        ? [
            {
              id: ts.activity.id,
              nom: ts.activity.nom,
              startTime: ts.startTime,
              endTime: ts.endTime,
            },
          ]
        : [],
    ) ?? [];

  if (orgaActivities.length === 0) {
    throw error(
      404,
      "Aucun créneau d'appel (orga) trouvé dans le planning pour cet événement.",
    );
  }

  // Auto-redirect when there is a single orga slot — no need for a picker.
  if (orgaActivities.length === 1) {
    throw redirect(
      302,
      resolve(
        `/staff/pedago/events/${params.id}/cockpit/${orgaActivities[0].id}`,
      ),
    );
  }

  return { event, orgaActivities, timezone: getCampusTimezone(locals) };
};
