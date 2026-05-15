import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { prisma } from '$lib/server/db';
import { getCampusId } from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import {
  getPendingObservables,
  markObservableObserved,
} from '$lib/server/services/observableTracker';

export const load: PageServerLoad = async ({ params, locals }) => {
  requireStaffGroup(locals, 'pedaMember');

  const event = await loadEventOr404(params.id, getCampusId(locals));

  // Joining talent through Participation gives us the existence check, the
  // event-membership check, and the talent record in a single round-trip —
  // and refuses any talentId that isn't inscribed in this event.
  const participation = await prisma.participation.findUnique({
    where: {
      talentId_eventId: { talentId: params.talentId, eventId: event.id },
    },
    select: {
      talent: { select: { id: true, prenom: true, nom: true } },
    },
  });
  if (!participation) {
    throw error(404, 'Talent non inscrit à cet événement');
  }

  const pending = await getPendingObservables(
    participation.talent.id,
    event.id,
  );

  return { event, talent: participation.talent, pending };
};

export const actions: Actions = {
  validate: async ({ request, params, locals }) => {
    requireStaffGroup(locals, 'pedaMember');
    // Re-check that the event lives in this staff member's campus before any
    // mutation. The pedago route guard only restricts by role, so without this
    // a peda from campus A could POST to campus B's URL and flip a state row.
    const event = await loadEventOr404(params.id, getCampusId(locals));

    const data = await request.formData();
    const observableId = data.get('observableId') as string;
    if (!observableId) return fail(400, { message: 'observableId manquant' });

    try {
      const result = await markObservableObserved({
        talentId: params.talentId,
        eventId: event.id,
        observableId,
        observedByStaffProfileId: locals.staffProfile.id,
      });
      return {
        success: true,
        newlyCertifiedCount: result.newlyCertifiedSkillLevelIds.length,
      };
    } catch (err) {
      console.error('[Observable validation] failed:', err);
      return fail(500, { message: 'Erreur lors de la validation' });
    }
  },
};
