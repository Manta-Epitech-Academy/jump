import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { studentSchema } from '$lib/validation/students';
import { createScoped } from '$lib/pocketbase';
import {
	StudentsNiveauOptions,
	StudentsNiveauDifficulteOptions,
	StudentsLevelOptions
} from '$lib/pocketbase-types';
import { ClientResponseError } from 'pocketbase';

export const load: PageServerLoad = async ({ locals }) => {
	const students = await locals.pb.collection('students').getFullList({
		sort: 'nom,prenom'
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
		if (!form.valid) return fail(400, { form });
		try {
			// Random password (they will use OTP anyway)
			const tempPassword = crypto.randomUUID() + Math.random().toString(36);

			// Scoped Creation
			await createScoped(locals.pb, 'students', {
				...form.data,
				niveau: form.data.niveau as StudentsNiveauOptions,
				niveau_difficulte: form.data.niveau_difficulte as StudentsNiveauDifficulteOptions,

				// Auth & Default Fields
				emailVisibility: true,
				password: tempPassword,
				passwordConfirm: tempPassword,
				verified: false,
				level: StudentsLevelOptions.Novice,
				badges: [],
				xp: 0,
				events_count: 0
			});
			return message(form, 'Élève ajouté avec succès !');
		} catch (err) {
			// Handle unique constraint violation (Campus + Nom + Prénom + Email)
			if (err instanceof ClientResponseError && err.status === 400) {
				return message(form, 'Un élève identique (Même nom, prénom et email) existe déjà.', {
					status: 400
				});
			}
			console.error(err);
			return message(form, "Erreur lors de l'ajout", { status: 500 });
		}
	},

	update: async ({ request, locals }) => {
		const formData = await request.formData();
		const form = await superValidate(formData, zod4(studentSchema));
		const id = formData.get('id') as string;
		if (!form.valid || !id) return fail(400, { form });
		try {
			await locals.pb.collection('students').update(id, {
				...form.data,
				niveau_difficulte: form.data.niveau_difficulte as StudentsNiveauDifficulteOptions
			});
			return message(form, 'Élève modifié avec succès !');
		} catch (err) {
			if (err instanceof ClientResponseError && err.status === 400) {
				return message(form, 'Un élève avec ce nom et cet email existe déjà.', { status: 400 });
			}
			return message(form, 'Erreur lors de la modification', { status: 500 });
		}
	},

	delete: async ({ url, locals }) => {
		const id = url.searchParams.get('id');
		if (!id) return fail(400);
		try {
			await locals.pb.collection('students').delete(id);
			return { success: true };
		} catch (err) {
			return fail(500);
		}
	}
};
