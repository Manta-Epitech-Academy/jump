import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { studentSchema } from '$lib/validation/students';

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
			await locals.pb.collection('students').create(form.data);
			return message(form, 'Élève ajouté avec succès !');
		} catch (err) {
			return message(form, "Erreur lors de l'ajout", { status: 500 });
		}
	},

	update: async ({ request, locals }) => {
		const formData = await request.formData();
		const form = await superValidate(formData, zod4(studentSchema));
		const id = formData.get('id') as string;
		if (!form.valid || !id) return fail(400, { form });
		try {
			await locals.pb.collection('students').update(id, form.data);
			return message(form, 'Élève modifié avec succès !');
		} catch (err) {
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
