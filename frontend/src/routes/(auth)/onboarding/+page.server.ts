import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import { m } from '$lib/paraglide/messages.js';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    throw redirect(303, resolve('/login'));
  }

  // If already has a campus, go home, UNLESS we are explicitly asking to change it
  if (locals.staffProfile?.campusId && !url.searchParams.get('change')) {
    throw redirect(303, resolve('/'));
  }

  const campuses = await prisma.campus.findMany({
    orderBy: { name: 'asc' },
  });

  return { campuses };
};

export const actions: Actions = {
  joinCampus: async ({ request, locals }) => {
    if (!locals.user) {
      throw redirect(303, resolve('/login'));
    }

    const formData = await request.formData();
    const campusId = formData.get('campusId') as string;

    if (!campusId) {
      return fail(400, { message: m.onboarding_campus_required() });
    }

    try {
      // Ensure StaffProfile exists (create if missing)
      const staffProfile = await prisma.staffProfile.upsert({
        where: { userId: locals.user.id },
        update: { campusId },
        create: { userId: locals.user.id, campusId },
      });

      // Also ensure role is set to staff
      if (locals.user.role !== 'staff' && locals.user.role !== 'admin') {
        await prisma.user.update({
          where: { id: locals.user.id },
          data: { role: 'staff' },
        });
      }
    } catch (err) {
      console.error('Error joining campus:', err);
      return fail(500, { message: m.onboarding_save_error() });
    }

    throw redirect(303, resolve('/'));
  },
};
