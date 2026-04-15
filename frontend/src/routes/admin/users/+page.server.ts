import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import type { StaffRole } from '@prisma/client';

export const load: PageServerLoad = async () => {
  // Load all users with their staff profiles (which hold campus info) and all campuses
  const [users, campuses] = await Promise.all([
    prisma.bauth_user.findMany({
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
      await prisma.staffProfile.upsert({
        where: { userId },
        update: { campusId: campusId || null },
        create: { userId, campusId: campusId || null },
      });
      return { success: true };
    } catch (err) {
      console.error(err);
      return fail(500, { message: 'Erreur lors de la mise à jour' });
    }
  },

  updateRole: async ({ request }) => {
    const data = await request.formData();
    const userId = data.get('userId') as string;
    const staffRole = data.get('staffRole') as string;

    if (!userId) return fail(400);

    try {
      await prisma.staffProfile.upsert({
        where: { userId },
        update: { staffRole: (staffRole || null) as StaffRole | null },
        create: { userId, staffRole: (staffRole || null) as StaffRole | null },
      });
      return { success: true };
    } catch (err) {
      console.error(err);
      return fail(500, { message: 'Erreur lors de la mise à jour du rôle' });
    }
  },

  // Revoke a user's access entirely
  deleteUser: async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) return fail(400);

    try {
      await prisma.bauth_user.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      return fail(500, { message: 'Erreur lors de la suppression du membre.' });
    }
  },
};
