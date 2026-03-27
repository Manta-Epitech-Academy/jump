import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { subjectSchema } from '$lib/validation/subjects';
import { ClientResponseError } from 'pocketbase';
import { createScoped } from '$lib/pocketbase';
import { SubjectsDifficulteOptions } from '$lib/pocketbase-types';
import type { UsersResponse } from '$lib/pocketbase-types';

export const load: PageServerLoad = async ({ locals }) => {
  // Fetch ALL subjects (Official + Local + Community)
  const subjects = await locals.pb.collection('subjects').getFullList({
    sort: '-created',
    expand: 'themes,campus',
  });

  const themes = await locals.pb.collection('themes').getFullList({
    sort: 'nom',
  });

  const form = await superValidate(zod4(subjectSchema));

  return {
    subjects,
    themes,
    form,
  };
};

/**
 * Helper to convert a list of Theme Names (strings) into Theme IDs.
 */
async function processThemes(pb: App.Locals['pb'], themeNames: string[]) {
  const themeIds: string[] = [];

  for (const name of themeNames) {
    if (!name.trim()) continue;

    try {
      const userCampus = pb.authStore.record?.campus;
      const existing = await pb
        .collection('themes')
        .getFirstListItem(
          `nom = "${name.replace(/"/g, '\\"')}" && (campus = "" || campus = "${userCampus}")`,
        );
      themeIds.push(existing.id);
    } catch (e) {
      const created = await createScoped(pb, 'themes', { nom: name });
      themeIds.push(created.id);
    }
  }
  return themeIds;
}

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const form = await superValidate(request, zod4(subjectSchema));

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      const themeIds = await processThemes(locals.pb, form.data.themes);

      await createScoped(locals.pb, 'subjects', {
        ...form.data,
        difficulte: form.data.difficulte as SubjectsDifficulteOptions,
        themes: themeIds,
      });

      return message(form, 'Sujet créé avec succès !');
    } catch (err) {
      console.error('Erreur création sujet:', err);
      return message(form, 'Erreur lors de la création', { status: 500 });
    }
  },

  update: async ({ request, locals }) => {
    const formData = await request.formData();
    const form = await superValidate(formData, zod4(subjectSchema));
    const id = formData.get('id') as string;

    if (!form.valid) {
      return fail(400, { form });
    }

    if (!id) {
      return message(form, 'ID sujet manquant', { status: 400 });
    }

    try {
      const subject = await locals.pb.collection('subjects').getOne(id);

      if (subject.campus !== (locals.user as UsersResponse)?.campus) {
        return message(
          form,
          "Vous ne pouvez pas modifier un sujet qui n'est pas le vôtre.",
          {
            status: 403,
          },
        );
      }

      const themeIds = await processThemes(locals.pb, form.data.themes);

      await locals.pb.collection('subjects').update(id, {
        ...form.data,
        difficulte: form.data.difficulte as SubjectsDifficulteOptions,
        themes: themeIds,
      });

      return message(form, 'Sujet mis à jour avec succès !');
    } catch (err) {
      console.error('Erreur update sujet:', err);
      return message(form, 'Erreur lors de la modification', { status: 500 });
    }
  },

  delete: async ({ url, locals }) => {
    const id = url.searchParams.get('id');
    if (!id) return fail(400);

    try {
      const subject = await locals.pb.collection('subjects').getOne(id);

      if (subject.campus !== (locals.user as UsersResponse)?.campus) {
        return fail(403, {
          message:
            "Vous ne pouvez pas supprimer un sujet qui n'est pas le vôtre.",
        });
      }

      await locals.pb.collection('subjects').delete(id);
      return { success: true };
    } catch (err) {
      console.error('Erreur suppression sujet:', err);

      if (err instanceof ClientResponseError && err.status === 400) {
        return fail(400, {
          message:
            'Impossible de supprimer le sujet car il est lié à un ou plusieurs événements.',
        });
      }

      return fail(500, {
        message: 'Une erreur technique est survenue lors de la suppression.',
      });
    }
  },
};
