import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { resolve } from '$app/paths';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.student) {
    throw error(401, 'Non autorisé');
  }

  if (locals.student.charter_accepted_at) {
    throw redirect(303, resolve('/camper'));
  }
};

export const actions: Actions = {
  accept: async ({ locals }) => {
    if (!locals.student) {
      throw error(401, 'Non autorisé');
    }

    await locals.studentPb.collection('students').update(locals.student.id, {
      charter_accepted_at: new Date().toISOString(),
    });

    throw redirect(303, resolve('/camper'));
  },
};
