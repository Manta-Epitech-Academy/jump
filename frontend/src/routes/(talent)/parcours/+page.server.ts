import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { loadTalentParcours } from '#lib/server/talent/parcours.ts';
import { loadBadgeCollection } from '#lib/server/talent/badgeCollection.ts';
import { toDateKey } from '#lib/domain/planningTime.ts';
import { getTalentHome } from '#lib/server/services/talentHomeService.ts';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  // The XP total and the level are read from the layout's `data.talent`; this
  // load owns the journey. Every day in it is read on its event's campus clock,
  // so no timezone travels to the page.
  const now = new Date();
  // The badges in the talent's own calendar, the day the duck greets them on:
  // which of his lines are live today, and the month each badge was earned.
  const timeZone = locals.talentTimezone ?? 'Europe/Paris';
  const [parcours, collection] = await Promise.all([
    loadTalentParcours(locals.talent.id, now),
    loadBadgeCollection(locals.talent.id, toDateKey(now, timeZone), timeZone),
  ]);

  // A journey that has not begun points to the one event the campus puts
  // forward, the home hero's rule (`pointedEventShown`), and to nothing else.
  const empty = parcours.length === 0;
  const highlighted =
    empty && locals.talentCampusId
      ? (await getTalentHome(locals.talentCampusId, now)).highlight?.event
      : null;

  return {
    parcours,
    collection,
    invitation: highlighted
      ? { name: highlighted.name, signupUrl: highlighted.signupUrl }
      : null,
  };
};
