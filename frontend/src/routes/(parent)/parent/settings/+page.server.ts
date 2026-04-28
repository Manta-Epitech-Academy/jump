import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getParentLastName } from '$lib/domain/parent';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user || locals.user.role !== 'parent') {
    throw error(401, 'Non autorisé');
  }

  const parentName = locals.user.name ?? '';

  return {
    parentName,
    parentLastName: getParentLastName(parentName),
    email: locals.user.email,
  };
};
