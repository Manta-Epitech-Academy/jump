import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { addParticipantSchema, sessionSchema } from '$lib/validation/sessions';
import { studentSchema } from '$lib/validation/students';
import { CalendarDateTime, getLocalTimeZone } from '@internationalized/date';
import { getActivityXpValue } from '$lib/xp';
import { suggestBestActivity } from '$lib/recommender';

export const load: PageServerLoad = async ({ locals, params }) => {
	let session;
	try {
		session = await locals.pb.collection('sessions').getOne(params.id, {
			expand: 'theme',
			requestKey: null
		});
	} catch (e) {
		console.error(e);
		throw error(404, 'Session introuvable');
	}

	const participationsRaw = await locals.pb.collection('participations').getFullList({
		filter: `session = "${session.id}"`,
		expand: 'student,activity',
		sort: '-created',
		requestKey: null
	});

	const participations = await Promise.all(
		participationsRaw.map(async (p) => {
			const student = p.expand?.student;
			const currentActivity = p.expand?.activity;

			const alerts: { type: 'danger' | 'warning'; message: string }[] = [];

			if (student && currentActivity) {
				const history = await locals.pb.collection('participations').getList(1, 1, {
					filter: `student = "${student.id}" && activity = "${currentActivity.id}" && is_validated = true && session != "${session.id}"`,
					requestKey: null
				});

				if (history.totalItems > 0) {
					alerts.push({
						type: 'danger',
						message: 'DÉJÀ VALIDÉ : Cet élève a déjà réussi cet atelier par le passé.'
					});
				}

				if (currentActivity.niveaux && !currentActivity.niveaux.includes(student.niveau)) {
					alerts.push({
						type: 'warning',
						message: `NIVEAU : L'activité est prévue pour [${currentActivity.niveaux.join(', ')}], l'élève est en ${student.niveau}.`
					});
				}
			}

			return {
				...p,
				alerts
			};
		})
	);

	const allStudents = await locals.pb.collection('students').getFullList({
		sort: 'nom,prenom',
		requestKey: null
	});

	const activities = await locals.pb.collection('activities').getFullList({
		sort: 'nom',
		requestKey: null
	});

	const themes = await locals.pb.collection('themes').getFullList({
		sort: 'nom',
		requestKey: null
	});

	const sessionDate = new Date(session.date);
	// Format YYYY-MM-DD manually
	const dateString = sessionDate.toISOString().split('T')[0];
	// Format HH:MM manually
	const hours = String(sessionDate.getHours()).padStart(2, '0');
	const minutes = String(sessionDate.getMinutes()).padStart(2, '0');
	const timeString = `${hours}:${minutes}`;

	const editForm = await superValidate(
		{
			titre: session.titre,
			statut: session.statut as 'planifiee' | 'en_cours' | 'terminee',
			theme: session.expand?.theme?.nom || '',
			date: dateString,
			time: timeString
		},
		zod4(sessionSchema)
	);

	const addForm = await superValidate(zod4(addParticipantSchema));
	const createStudentForm = await superValidate(zod4(studentSchema));

	return {
		session,
		participations,
		allStudents,
		activities,
		themes,
		addForm,
		createStudentForm,
		editForm
	};
};

export const actions: Actions = {
	addExisting: async ({ request, locals, params }) => {
		const form = await superValidate(request, zod4(addParticipantSchema));
		if (!form.valid) return fail(400, { form });

		try {
			const duplicate = await locals.pb.collection('participations').getList(1, 1, {
				filter: `student = "${form.data.studentId}" && session = "${params.id}"`
			});

			if (duplicate.totalItems > 0) {
				return message(form, 'Cet élève est déjà inscrit à cette session.', { status: 400 });
			}

			// Get Session to know the theme
			const session = await locals.pb.collection('sessions').getOne(params.id);

			// Use the intelligent recommender
			const activities = await locals.pb.collection('activities').getFullList();
			const suggestedActivityId = await suggestBestActivity(
				locals.pb,
				form.data.studentId,
				activities,
				session.theme
			);

			await locals.pb.collection('participations').create({
				student: form.data.studentId,
				session: params.id,
				activity: suggestedActivityId,
				is_present: false,
				is_validated: false
			});

			return message(form, 'Élève ajouté avec une suggestion intelligente !');
		} catch (err) {
			console.error(err);
			return message(form, "Erreur technique lors de l'ajout.", { status: 500 });
		}
	},

	assignActivity: async ({ request, locals }) => {
		const data = await request.formData();
		const participationId = data.get('participationId') as string;
		const activityId = data.get('activityId') as string;

		try {
			await locals.pb.collection('participations').update(participationId, {
				activity: activityId === 'none' ? null : activityId
			});
			return { success: true };
		} catch (err) {
			console.error(err);
			return fail(500);
		}
	},

	quickCreateStudent: async ({ request, locals, params }) => {
		const form = await superValidate(request, zod4(studentSchema));
		if (!form.valid) return fail(400, { form });

		try {
			const newStudent = await locals.pb.collection('students').create(form.data);

			// Get Session to know the theme
			const session = await locals.pb.collection('sessions').getOne(params.id);

			// Use the intelligent recommender for the newly created student
			const activities = await locals.pb.collection('activities').getFullList();
			const suggestedActivityId = await suggestBestActivity(
				locals.pb,
				newStudent.id,
				activities,
				session.theme
			);

			await locals.pb.collection('participations').create({
				student: newStudent.id,
				session: params.id,
				activity: suggestedActivityId,
				is_present: false,
				is_validated: false
			});
			return message(form, 'Élève créé et assigné automatiquement !');
		} catch (err) {
			console.error(err);
			return message(form, 'Erreur lors de la création rapide.', { status: 500 });
		}
	},

	updateSession: async ({ request, locals, params }) => {
		const formData = await request.formData();

		const dateStr = formData.get('date') as string;
		const timeStr = formData.get('time') as string;
		const themeInput = formData.get('theme') as string;

		const transformedData = {
			titre: formData.get('titre'),
			date: dateStr,
			time: timeStr,
			statut: formData.get('statut'),
			theme: themeInput
		};

		const form = await superValidate(transformedData, zod4(sessionSchema));

		if (!form.valid) return fail(400, { form });

		try {
			if (!dateStr || !timeStr) throw new Error('Date ou heure manquante');

			const [year, month, day] = dateStr.split('-').map(Number);
			const [hour, minute] = timeStr.split(':').map(Number);
			const calendarDateTime = new CalendarDateTime(year, month, day, hour, minute);
			const jsDate = calendarDateTime.toDate(getLocalTimeZone());

			// Theme logic
			let themeId: string | null = null;
			if (form.data.theme && form.data.theme.trim() !== '') {
				const existing = await locals.pb
					.collection('themes')
					.getList(1, 1, { filter: `nom = "${form.data.theme.replace(/"/g, '\\"')}"` });

				if (existing.items.length > 0) {
					themeId = existing.items[0].id;
				} else {
					const created = await locals.pb.collection('themes').create({ nom: form.data.theme });
					themeId = created.id;
				}
			}

			await locals.pb.collection('sessions').update(params.id, {
				titre: form.data.titre,
				date: jsDate,
				statut: form.data.statut,
				theme: themeId
			});

			return message(form, 'Session mise à jour !');
		} catch (err) {
			console.error('Update Session Error:', err);
			return message(form, 'Impossible de mettre à jour la session', { status: 500 });
		}
	},

	remove: async ({ url, locals }) => {
		const id = url.searchParams.get('id');
		if (!id) return fail(400);

		try {
			const p = await locals.pb.collection('participations').getOne(id, {
				expand: 'activity'
			});

			if (p.is_validated) {
				const activity = p.expand?.activity;
				const xpValue = activity ? getActivityXpValue(activity.niveaux) : 20;

				await locals.pb.collection('students').update(p.student, {
					'xp-': xpValue,
					'sessions_count-': 1
				});
			}

			await locals.pb.collection('participations').delete(id);
			return { success: true };
		} catch (err) {
			console.error('Error on remove participation:', err);
			return fail(500);
		}
	},

	deleteSession: async ({ params, locals }) => {
		try {
			const participations = await locals.pb.collection('participations').getFullList({
				filter: `session = "${params.id}" && is_validated = true`,
				expand: 'activity'
			});

			for (const p of participations) {
				const activity = p.expand?.activity;
				const xpValue = activity ? getActivityXpValue(activity.niveaux) : 20;
				await locals.pb.collection('students').update(p.student, {
					'xp-': xpValue,
					'sessions_count-': 1
				});
			}

			await locals.pb.collection('sessions').delete(params.id);
		} catch (err) {
			console.error('Error deleting session:', err);
			return fail(500);
		}

		throw redirect(303, '/');
	}
};
