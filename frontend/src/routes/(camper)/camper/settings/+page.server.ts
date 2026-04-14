import type { Actions, PageServerLoad } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import { auth } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  return { talent: locals.talent };
};

export const actions: Actions = {
  unlinkDiscord: async ({ locals }) => {
    if (!locals.talent || !locals.user) {
      return fail(401, { message: 'Non autorisé' });
    }

    try {
      await prisma.talent.update({
        where: { id: locals.talent.id },
        data: { discordId: null },
      });
    } catch (err) {
      console.error('Error unlinking Discord:', err);
      return fail(500, { message: 'Erreur lors de la déconnexion de Discord' });
    }

    return { discordUnlinked: true };
  },

  deleteAccount: async ({ request, locals }) => {
    if (!locals.talent || !locals.user) {
      return fail(401, { message: 'Non autorisé' });
    }

    try {
      // Delete related records in a transaction
      await prisma.$transaction([
        prisma.portfolioItem.deleteMany({
          where: { talentId: locals.talent.id },
        }),
        prisma.stepsProgress.deleteMany({
          where: { talentId: locals.talent.id },
        }),
        prisma.participation.deleteMany({
          where: { talentId: locals.talent.id },
        }),
        prisma.talent.delete({
          where: { id: locals.talent.id },
        }),
        // Deleting the user cascades to sessions and accounts
        prisma.bauth_user.delete({
          where: { id: locals.user.id },
        }),
      ]);
    } catch (err) {
      console.error('Error deleting student account:', err);
      return fail(500, { message: 'Erreur lors de la suppression du compte' });
    }

    throw redirect(303, resolve('/camper/login'));
  },
};
