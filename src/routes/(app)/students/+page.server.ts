import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { studentSchema } from '$lib/validation/students';

export const load: PageServerLoad = async ({ locals, url }) => {
	// Récupération du filtre depuis l'URL (ex: ?niveau=3eme)
	const niveauFilter = url.searchParams.get('niveau');
	const filter = niveauFilter ? `niveau = '${niveauFilter}'` : '';

	const students = await locals.pb.collection('students').getFullList({
		sort: 'nom,prenom',
		filter
	});

	const form = await superValidate(zod4(studentSchema));

	return {
		students,
		form
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await superValidate(request, zod4(studentSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			await locals.pb.collection('students').create(form.data);
			return message(form, 'Élève ajouté avec succès !');
		} catch (err) {
			console.error('Erreur création élève:', err);
			return message(form, "Erreur lors de l'ajout", { status: 500 });
		}
	}
};
