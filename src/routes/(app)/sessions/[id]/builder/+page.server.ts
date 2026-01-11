import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { addParticipantSchema, sessionSchema } from '$lib/validation/sessions';
import { studentSchema } from '$lib/validation/students';
import { CalendarDateTime, getLocalTimeZone } from '@internationalized/date';
import { getActivityXpValue } from '$lib/xp';

export const load: PageServerLoad = async ({ locals, params }) => {
	let session;
	try {
		session = await locals.pb.collection('sessions').getOne(params.id, {
			expand: 'activity',
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
			const currentActivity = p.expand?.activity || session.expand?.activity;

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

	const sessionDate = new Date(session.date);
	const dateString = sessionDate.toISOString().split('T')[0];

	const editForm = await superValidate(
		{
			titre: session.titre,
			statut: session.statut as 'planifiee' | 'en_cours' | 'terminee',
			activity: session.activity,
			date: dateString,
			time: sessionDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
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

			await locals.pb.collection('participations').create({
				student: form.data.studentId,
				session: params.id,
				activity: null,
				is_present: false,
				is_validated: false
			});

			return message(form, 'Élève ajouté à la session !');
		} catch (err) {
			return message(form, "Erreur technique lors de l'ajout.", { status: 500 });
		}
	},

	assignActivity: async ({ request, locals }) => {
		const data = await request.formData();
		const participationId = data.get('participationId') as string;
		const activityId = data.get('activityId') as string;

		try {
			await locals.pb.collection('participations').update(participationId, {
				activity: activityId === 'session' ? null : activityId
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
			await locals.pb.collection('participations').create({
				student: newStudent.id,
				session: params.id,
				activity: null,
				is_present: false,
				is_validated: false
			});
			return message(form, 'Élève créé et ajouté !');
		} catch (err) {
			return message(form, 'Erreur lors de la création rapide.', { status: 500 });
		}
	},

	updateSession: async ({ request, locals, params }) => {
		const formData = await request.formData();

		const dateStr = formData.get('date') as string;
		const timeStr = formData.get('time') as string;
		let calendarDateTime: CalendarDateTime | undefined;

		if (dateStr && timeStr) {
			const [year, month, day] = dateStr.split('-').map(Number);
			const [hour, minute] = timeStr.split(':').map(Number);
			calendarDateTime = new CalendarDateTime(year, month, day, hour, minute);
		}

		const transformedData = {
			titre: formData.get('titre'),
			date: calendarDateTime,
			time: timeStr,
			statut: formData.get('statut'),
			activity: formData.get('activity')
		};

		const form = await superValidate(transformedData, zod4(sessionSchema));

		if (form.data.date && form.data.date instanceof CalendarDateTime) {
			form.data.date = form.data.date.toString();
		}

		if (!form.valid) return fail(400, { form });

		try {
			if (!calendarDateTime) throw new Error('Date invalide');

			const jsDate = calendarDateTime.toDate(getLocalTimeZone());

			await locals.pb.collection('sessions').update(params.id, {
				titre: form.data.titre,
				date: jsDate,
				statut: form.data.statut,
				activity: form.data.activity
			});

			return message(form, 'Session mise à jour avec succès !');
		} catch (err) {
			console.error(err);
			return message(form, 'Impossible de mettre à jour la session', { status: 500 });
		}
	},

	remove: async ({ url, locals }) => {
		const id = url.searchParams.get('id');
		if (!id) return fail(400);

		try {
			const p = await locals.pb.collection('participations').getOne(id, {
				expand: 'session.activity'
			});

			if (p.is_validated) {
				const activity = p.expand?.session?.expand?.activity;
				const xpValue = getActivityXpValue(activity?.niveaux);

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
	}
};
