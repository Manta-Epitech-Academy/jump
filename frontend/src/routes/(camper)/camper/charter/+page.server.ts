import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  if (locals.talent.charterAcceptedAt) {
    throw redirect(303, resolve('/camper'));
  }
};

export const actions: Actions = {
  accept: async ({ locals }) => {
    if (!locals.talent) {
      throw error(401, 'Non autorisé');
    }

    await prisma.talent.update({
      where: { id: locals.talent.id },
      data: { charterAcceptedAt: new Date() },
    });

    throw redirect(303, resolve('/camper'));
  },
};
