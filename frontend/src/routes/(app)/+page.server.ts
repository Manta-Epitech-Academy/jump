import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { now } from '@internationalized/date';
import { EventService } from '$lib/server/services/events';
import { getCampusId, getCampusTimezone, scopedPrisma } from '$lib/server/db/scoped';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw error(401, 'Authentification requise');
  }

  try {
    const db = scopedPrisma(getCampusId(locals));
    const tz = getCampusTimezone(locals);
    const tzNow = now(tz);
    const startOfDay = tzNow.set({
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    });
    const filterDate = startOfDay.toDate();

    const events = await db.event.findMany({
      where: {
        date: { gte: filterDate },
      },
      include: {
        theme: true,
        mantas: { include: { staffProfile: { include: { user: true } } } },
      },
      orderBy: { date: 'asc' },
    });

    return {
      events: events.map((event) => ({
        id: event.id,
        titre: event.titre,
        date: event.date,
        theme: event.theme?.nom,
        mantas: event.mantas.map((m) => ({
          name: m.staffProfile.user?.name || '',
          // TODO: implement S3 file storage for avatars
          avatarUrl: m.staffProfile.avatar,
        })),
      })),
    };
  } catch (err) {
    console.error('Erreur load dashboard:', err);
    throw error(500, 'Erreur chargement événements');
  }
};

export const actions: Actions = {
  deleteEvent: async ({ url, locals }) => {
    const id = url.searchParams.get('id');
    if (!id) return fail(400);

    try {
      await EventService.deleteEvent(id, getCampusId(locals));
      return { success: true };
    } catch (err) {
      console.error('Erreur suppression événement:', err);
      return fail(500, { message: 'Erreur lors de la suppression' });
    }
  },

  duplicateEvent: async ({ request, locals }) => {
    const data = await request.formData();
    const originalId = data.get('originalId') as string;
    const titre = data.get('titre') as string;
    const dateStr = data.get('date') as string;
    const timeStr = data.get('time') as string;

    if (!originalId || !titre || !dateStr || !timeStr) {
      return fail(400, { message: 'Données manquantes' });
    }

    try {
      const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
      const [hour, minute] = timeStr.split(':').map(Number);
      const newDate = new Date(year, month - 1, day, hour, minute);

      if (isNaN(newDate.getTime())) {
        return fail(400, { message: 'Valeur de temps invalide' });
      }

      const campusId = getCampusId(locals);
      const newEventId = await EventService.duplicateEvent(
        originalId,
        { titre, date: newDate.toISOString() },
        campusId,
      );

      return { success: true, newEventId };
    } catch (err) {
      console.error('Erreur duplication événement:', err);
      return fail(500, { message: 'Erreur lors de la duplication' });
    }
  },
};
