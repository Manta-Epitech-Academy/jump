import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { loadTalentParcours } from '$lib/server/talent/parcours';
import { getTalentHome } from '$lib/server/services/talentHomeService';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  // The XP total and the level are read from the layout's `data.talent`; this
  // load owns the journey. Every day in it is read on its event's campus clock,
  // so no timezone travels to the page.
  const now = new Date();
  const parcours = await loadTalentParcours(locals.talent.id, now);

  // A journey that has not begun points to the one event the campus puts
  // forward, the home hero's rule (`pointedEventShown`), and to nothing else.
  const empty = parcours.length === 0;
  const highlighted =
    empty && locals.talentCampusId
      ? (await getTalentHome(locals.talentCampusId, now)).highlight?.event
      : null;

  return {
    parcours,
    invitation: highlighted
      ? { name: highlighted.name, signupUrl: highlighted.signupUrl }
      : null,
  };
};
