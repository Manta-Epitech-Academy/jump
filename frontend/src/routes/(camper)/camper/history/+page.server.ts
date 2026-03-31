import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import type { ParticipationsResponse } from '$lib/pocketbase-types';
import { getParisStartOfDay, type ParticipationExpand } from '$lib/utils';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.student) {
    throw error(401, 'Non autorisé');
  }

  const filterDateStart = getParisStartOfDay();

  const pastParticipations = await locals.studentPb
    .collection('participations')
    .getFullList<ParticipationsResponse<ParticipationExpand>>({
      filter: `student = "${locals.student.id}" && event.date < "${filterDateStart}" && is_present = true`,
      expand: 'event,subjects',
      sort: '-event.date',
    });

  return {
    student: locals.student,
    pastParticipations,
  };
};
