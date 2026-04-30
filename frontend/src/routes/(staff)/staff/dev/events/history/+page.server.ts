import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { EventService } from '$lib/server/services/events';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { requireFlag, requireStaffGroup } from '$lib/server/auth/guards';
import { getLifecycleBounds, pastEventWhere } from '$lib/domain/eventLifecycle';

export const load: PageServerLoad = async ({ locals }) => {
  requireFlag(locals, 'coding_club');
  try {
    const db = scopedPrisma(getCampusId(locals));
    const bounds = getLifecycleBounds(getCampusTimezone(locals));
    const events = await db.event.findMany({
      where: pastEventWhere(bounds),
      include: {
        theme: true,
        mantas: { include: { staffProfile: { include: { user: true } } } },
        participations: {
          where: { isPresent: true },
          select: { id: true },
        },
      },
      orderBy: { date: 'desc' },
    });

    return {
      events: events.map((event) => ({
        id: event.id,
        titre: event.titre,
        date: event.date,
        theme: event.theme?.nom,
        presentCount: event.participations.length,
        mantas: event.mantas.map((m) => ({
          name: m.staffProfile.user?.name || '',
          // TODO: implement S3 file storage for avatars
          avatarUrl: m.staffProfile.avatar,
        })),
      })),
    };
  } catch (err) {
    console.error('Error loading history:', err);
    throw error(500, 'Erreur chargement historique');
  }
};

export const actions: Actions = {
  deleteEvent: async ({ url, locals }) => {
    requireStaffGroup(locals, 'devLead');
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
    requireStaffGroup(locals, 'devLead');
    requireFlag(locals, 'coding_club');
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
