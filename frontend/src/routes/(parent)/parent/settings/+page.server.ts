import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user || locals.user.role !== 'parent') {
    throw error(401, 'Non autorisé');
  }

  const parentName = locals.user.name ?? '';
  const parentLastName = parentName.split(' ').slice(1).join(' ') || parentName;

  return {
    parentName,
    parentLastName,
    email: locals.user.email,
  };
};
