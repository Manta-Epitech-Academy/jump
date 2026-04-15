import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { prisma } from '$lib/server/db';

const campusSchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères').trim(),
  externalName: z.string().trim().nullable().default(null),
  timezone: z.string().min(1).default('Europe/Paris'),
});

export const load: PageServerLoad = async () => {
  // Fetch all campuses ordered by name
  const campuses = await prisma.campus.findMany({
    orderBy: { name: 'asc' },
  });

  const form = await superValidate(zod4(campusSchema));

  return { campuses, form };
};

export const actions: Actions = {
  // Create a new campus
  create: async ({ request }) => {
    const form = await superValidate(request, zod4(campusSchema));
    if (!form.valid) return fail(400, { form });

    try {
      await prisma.campus.create({
        data: {
          ...form.data,
          externalName: form.data.externalName || null,
        },
      });
      return message(form, 'Campus créé avec succès.');
    } catch (err) {
      console.error(err);
      return message(form, 'Erreur lors de la création du campus.', {
        status: 500,
      });
    }
  },

  // Update an existing campus by its ID
  update: async ({ request }) => {
    const formData = await request.formData();
    const form = await superValidate(formData, zod4(campusSchema));
    const id = formData.get('id') as string;

    if (!form.valid || !id) return fail(400, { form });

    try {
      await prisma.campus.update({
        where: { id },
        data: {
          ...form.data,
          externalName: form.data.externalName || null,
        },
      });
      return message(form, 'Campus mis à jour.');
    } catch (err) {
      return message(form, 'Erreur lors de la mise à jour.', { status: 500 });
    }
  },

  // Delete a campus and prevent deletion if linked to external data
  delete: async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) return fail(400);

    try {
      // SECURITY : Check if the campus is used before deleting
      const [studentsUsed, eventsUsed, staffUsed] = await Promise.all([
        prisma.talent.count({ where: { campusId: id } }),
        prisma.event.count({ where: { campusId: id } }),
        prisma.staffProfile.count({ where: { campusId: id } }),
      ]);

      if (studentsUsed > 0 || eventsUsed > 0 || staffUsed > 0) {
        return fail(400, {
          message: `Suppression impossible : Ce campus contient ${studentsUsed} élèves, ${eventsUsed} événements et ${staffUsed} membres du staff.`,
        });
      }

      await prisma.campus.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      return fail(500, { message: 'Erreur lors de la suppression.' });
    }
  },
};
