import type { Actions, PageServerLoad } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import { auth } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.studentProfile) {
    throw error(401, 'Non autorisé');
  }

  return { studentProfile: locals.studentProfile };
};

export const actions: Actions = {
  unlinkDiscord: async ({ locals }) => {
    if (!locals.studentProfile || !locals.user) {
      return fail(401, { message: 'Non autorisé' });
    }

    try {
      await prisma.$transaction([
        prisma.account.deleteMany({
          where: { userId: locals.user.id, providerId: 'discord' },
        }),
        prisma.studentProfile.update({
          where: { id: locals.studentProfile.id },
          data: { discordId: null },
        }),
      ]);
    } catch (err) {
      console.error('Error unlinking Discord:', err);
      return fail(500, { message: 'Erreur lors de la déconnexion de Discord' });
    }

    return { discordUnlinked: true };
  },

  deleteAccount: async ({ request, locals }) => {
    if (!locals.studentProfile || !locals.user) {
      return fail(401, { message: 'Non autorisé' });
    }

    try {
      // Delete related records in a transaction
      await prisma.$transaction([
        prisma.portfolioItem.deleteMany({
          where: { studentProfileId: locals.studentProfile.id },
        }),
        prisma.stepsProgress.deleteMany({
          where: { studentProfileId: locals.studentProfile.id },
        }),
        prisma.participationSubject.deleteMany({
          where: {
            participation: {
              studentProfileId: locals.studentProfile.id,
            },
          },
        }),
        prisma.participation.deleteMany({
          where: { studentProfileId: locals.studentProfile.id },
        }),
        prisma.studentProfile.delete({
          where: { id: locals.studentProfile.id },
        }),
        // Deleting the user cascades to sessions and accounts
        prisma.user.delete({
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
