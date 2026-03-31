import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { now } from '@internationalized/date';
import type { ParticipationsResponse } from '$lib/pocketbase-types';
import {
  getParisStartOfDay,
  tallyTopThemes,
  type ParticipationExpand,
  type ThemeExpandedParticipation,
} from '$lib/utils';

export const load: PageServerLoad = async ({ locals }) => {
  // Security guard: Ensure we have a logged-in student
  if (!locals.student) {
    throw error(401, 'Non autorisé');
  }

  try {
    // Calculate boundaries for "Today" in the user's timezone (Europe/Paris)
    const filterDateStart = getParisStartOfDay();
    const parisNow = now('Europe/Paris');
    const endOfDay = parisNow.set({
      hour: 23,
      minute: 59,
      second: 59,
      millisecond: 999,
    });
    const filterDateEnd = endOfDay.toDate().toISOString().replace('T', ' ');

    // Fetch participations for today
    const participations = await locals.studentPb
      .collection('participations')
      .getFullList<ParticipationsResponse<ParticipationExpand>>({
        filter: `student = "${locals.student.id}" && event.date >= "${filterDateStart}" && event.date <= "${filterDateEnd}"`,
        expand: 'event,subjects',
        sort: 'event.date',
      });

    // Fetch a small preview of past completed participations + total count
    const pastPage = await locals.studentPb
      .collection('participations')
      .getList<ParticipationsResponse<ParticipationExpand>>(1, 2, {
        filter: `student = "${locals.student.id}" && event.date < "${filterDateStart}" && is_present = true`,
        expand: 'event,subjects',
        sort: '-event.date',
      });

    // Fetch all completed participations to build the RPG Skill Radar
    const allCompleted = await locals.studentPb
      .collection('participations')
      .getFullList<ThemeExpandedParticipation>({
        filter: `student = "${locals.student.id}" && is_present = true`,
        expand: 'subjects.themes',
        fields: 'id,expand.subjects.expand.themes.nom',
      });

    const topThemes = tallyTopThemes(allCompleted, 3);

    // If there are multiple events today, grab the first one
    const todayParticipation =
      participations.length > 0 ? participations[0] : null;

    return {
      student: locals.student,
      participation: todayParticipation,
      pastParticipations: pastPage.items,
      totalPastParticipations: pastPage.totalItems,
      hasCompletedEvents: pastPage.totalItems > 0,
      topThemes,
    };
  } catch (err) {
    console.error('Error fetching camper dashboard data:', err);
    throw error(500, 'Erreur lors du chargement du dashboard');
  }
};
