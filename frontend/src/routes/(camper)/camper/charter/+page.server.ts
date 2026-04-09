import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import { m } from '$lib/paraglide/messages.js';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.studentProfile) {
    throw error(401, m.server_error_unauthorized());
  }

  if (locals.studentProfile.charterAcceptedAt) {
    throw redirect(303, resolve('/camper'));
  }
};

export const actions: Actions = {
  accept: async ({ locals }) => {
    if (!locals.studentProfile) {
      throw error(401, m.server_error_unauthorized());
    }

    await prisma.studentProfile.update({
      where: { id: locals.studentProfile.id },
      data: { charterAcceptedAt: new Date() },
    });

    throw redirect(303, resolve('/camper'));
  },
};
