import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { addParticipantSchema } from '$lib/validation/sessions';
import { studentSchema } from '$lib/validation/students';

export const load: PageServerLoad = async ({ locals, params }) => {
	let session;
	try {
		session = await locals.pb.collection('sessions').getOne(params.id, {
			expand: 'activity'
		});
	} catch (e) {
		console.error(e);
		throw error(404, 'Session introuvable');
	}

	const participations = await locals.pb.collection('participations').getFullList({
		filter: `session = "${session.id}"`,
		expand: 'student',
		sort: '-created'
	});

	const allStudents = await locals.pb.collection('students').getFullList({
		sort: 'nom,prenom'
	});

	const addForm = await superValidate(zod4(addParticipantSchema));
	const createStudentForm = await superValidate(zod4(studentSchema));

	return {
		session,
		participations,
		allStudents,
		addForm,
		createStudentForm
	};
};

export const actions: Actions = {
	addExisting: async ({ request, locals, params }) => {
		const form = await superValidate(request, zod4(addParticipantSchema));

		if (!form.valid) return fail(400, { form });

		try {
			const session = await locals.pb.collection('sessions').getOne(params.id);

			// INTELLIGENCE : Vérifier si l'élève a déjà validé cette activité dans le passé
			// On cherche une participation validée, pour cet étudiant, sur une session qui avait la même activité
			const pastSuccess = await locals.pb.collection('participations').getList(1, 1, {
				filter: `student = "${form.data.studentId}" && is_validated = true && session.activity = "${session.activity}"`
			});

			if (pastSuccess.totalItems > 0) {
				// On n'empêche pas l'ajout (peut-être qu'il veut refaire), mais on prévient via message flash si besoin
				// Ici, on retourne juste un message informatif dans le form return si on voulait être bloquant.
			}

			const duplicate = await locals.pb.collection('participations').getList(1, 1, {
				filter: `student = "${form.data.studentId}" && session = "${params.id}"`
			});

			if (duplicate.totalItems > 0) {
				return message(form, 'Cet élève est déjà inscrit à cette session.', { status: 400 });
			}

			await locals.pb.collection('participations').create({
				student: form.data.studentId,
				session: params.id,
				is_present: false,
				is_validated: false
			});

			return message(form, 'Élève ajouté à la session !');
		} catch (err) {
			console.error(err);
			return message(form, "Erreur technique lors de l'ajout.", { status: 500 });
		}
	},

	quickCreateStudent: async ({ request, locals, params }) => {
		const form = await superValidate(request, zod4(studentSchema));

		if (!form.valid) return fail(400, { form });

		try {
			const newStudent = await locals.pb.collection('students').create(form.data);

			await locals.pb.collection('participations').create({
				student: newStudent.id,
				session: params.id,
				is_present: false,
				is_validated: false
			});

			return message(form, 'Élève créé et ajouté !');
		} catch (err) {
			console.error(err);
			return message(form, 'Erreur lors de la création rapide.', { status: 500 });
		}
	},

	remove: async ({ url, locals }) => {
		const id = url.searchParams.get('id');
		if (!id) return fail(400);

		try {
			await locals.pb.collection('participations').delete(id);
			return { success: true };
		} catch (err) {
			console.error(err);
			return fail(500);
		}
	}
};
