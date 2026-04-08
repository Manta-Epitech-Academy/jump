import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async () => {
  // Load all users with their staff profiles (which hold campus info) and all campuses
  const [users, campuses] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
      include: { staffProfile: { include: { campus: true } } },
    }),
    prisma.campus.findMany({ orderBy: { name: 'asc' } }),
  ]);

  return { users, campuses };
};

export const actions: Actions = {
  // Reassign a user to a different campus
  updateCampus: async ({ request }) => {
    const data = await request.formData();
    const userId = data.get('userId') as string;
    const campusId = data.get('campusId') as string;

    if (!userId) return fail(400);

    try {
      await prisma.staffProfile.update({
        where: { userId },
        data: { campusId: campusId || null },
      });
      return { success: true };
    } catch (err) {
      console.error(err);
      return fail(500, { message: 'Erreur lors de la mise à jour' });
    }
  },

  // Revoke a user's access entirely
  deleteUser: async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) return fail(400);

    try {
      await prisma.user.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      return fail(500, { message: 'Erreur lors de la suppression du membre.' });
    }
  },
};
