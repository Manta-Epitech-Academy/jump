import type { Actions, PageServerLoad } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.student) {
    throw error(401, 'Non autorisé');
  }

  return { student: locals.student };
};

export const actions: Actions = {
  deleteAccount: async ({ locals }) => {
    if (!locals.student) {
      return fail(401, { message: 'Non autorisé' });
    }

    const studentId = locals.student.id;
    const pb = locals.systemPb;

    try {
      const collections = ['portfolio_items', 'steps_progress'] as const;

      for (const collection of collections) {
        const records = await pb.collection(collection).getFullList({
          filter: `student = "${studentId}"`,
          fields: 'id',
        });
        await Promise.all(
          records.map((record) => pb.collection(collection).delete(record.id)),
        );
      }

      await pb.collection('students').delete(studentId);

      locals.studentPb.authStore.clear();
      locals.student = null;
    } catch (err) {
      console.error('Error deleting student account:', err);
      return fail(500, { message: 'Erreur lors de la suppression du compte' });
    }

    throw redirect(303, resolve('/camper/login'));
  },
};
