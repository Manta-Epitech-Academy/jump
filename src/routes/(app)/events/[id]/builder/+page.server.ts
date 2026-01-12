import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { addParticipantSchema, eventSchema } from '$lib/validation/events';
import { studentSchema } from '$lib/validation/students';
import { CalendarDateTime, getLocalTimeZone } from '@internationalized/date';
import { getSubjectXpValue } from '$lib/xp';
import { suggestBestSubject } from '$lib/recommender';

export const load: PageServerLoad = async ({ locals, params }) => {
	let event;
	try {
		event = await locals.pb.collection('events').getOne(params.id, {
			expand: 'theme',
			requestKey: null
		});
	} catch (e) {
		console.error(e);
		throw error(404, 'Événement introuvable');
	}

	const participationsRaw = await locals.pb.collection('participations').getFullList({
		filter: `event = "${event.id}"`,
		expand: 'student,subject',
		sort: '-created',
		requestKey: null
	});

	const participations = await Promise.all(
		participationsRaw.map(async (p) => {
			const student = p.expand?.student;
			const currentSubject = p.expand?.subject;

			const alerts: { type: 'danger' | 'warning'; message: string }[] = [];

			if (student && currentSubject) {
				const history = await locals.pb.collection('participations').getList(1, 1, {
					filter: `student = "${student.id}" && subject = "${currentSubject.id}" && is_validated = true && event != "${event.id}"`,
					requestKey: null
				});

				if (history.totalItems > 0) {
					alerts.push({
						type: 'danger',
						message: 'DÉJÀ VALIDÉ : Cet élève a déjà réussi ce sujet par le passé.'
					});
				}

				if (currentSubject.niveaux && !currentSubject.niveaux.includes(student.niveau)) {
					alerts.push({
						type: 'warning',
						message: `NIVEAU : Le sujet est prévu pour [${currentSubject.niveaux.join(', ')}], l'élève est en ${student.niveau}.`
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

	const subjects = await locals.pb.collection('subjects').getFullList({
		sort: 'nom',
		requestKey: null
	});

	const themes = await locals.pb.collection('themes').getFullList({
		sort: 'nom',
		requestKey: null
	});

	const eventDate = new Date(event.date);
	// Format YYYY-MM-DD manually
	const dateString = eventDate.toISOString().split('T')[0];
	// Format HH:MM manually
	const hours = String(eventDate.getHours()).padStart(2, '0');
	const minutes = String(eventDate.getMinutes()).padStart(2, '0');
	const timeString = `${hours}:${minutes}`;

	const editForm = await superValidate(
		{
			titre: event.titre,
			statut: event.statut as 'planifiee' | 'en_cours' | 'terminee',
			theme: event.expand?.theme?.nom || '',
			date: dateString,
			time: timeString
		},
		zod4(eventSchema)
	);

	const addForm = await superValidate(zod4(addParticipantSchema));
	const createStudentForm = await superValidate(zod4(studentSchema));

	return {
		event,
		participations,
		allStudents,
		subjects,
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
				filter: `student = "${form.data.studentId}" && event = "${params.id}"`
			});

			if (duplicate.totalItems > 0) {
				return message(form, 'Cet élève est déjà inscrit à cet événement.', { status: 400 });
			}

			// Get Event to know the theme
			const event = await locals.pb.collection('events').getOne(params.id);

			// Use the intelligent recommender
			const subjects = await locals.pb.collection('subjects').getFullList();
			const suggestedSubjectId = await suggestBestSubject(
				locals.pb,
				form.data.studentId,
				subjects,
				event.theme
			);

			await locals.pb.collection('participations').create({
				student: form.data.studentId,
				event: params.id,
				subject: suggestedSubjectId,
				is_present: false,
				is_validated: false
			});

			return message(form, 'Élève ajouté avec une suggestion intelligente !');
		} catch (err) {
			console.error(err);
			return message(form, "Erreur technique lors de l'ajout.", { status: 500 });
		}
	},

	assignSubject: async ({ request, locals }) => {
		const data = await request.formData();
		const participationId = data.get('participationId') as string;
		const subjectId = data.get('subjectId') as string;

		try {
			await locals.pb.collection('participations').update(participationId, {
				subject: subjectId === 'none' ? null : subjectId
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

			// Get Event to know the theme
			const event = await locals.pb.collection('events').getOne(params.id);

			// Use the intelligent recommender for the newly created student
			const subjects = await locals.pb.collection('subjects').getFullList();
			const suggestedSubjectId = await suggestBestSubject(
				locals.pb,
				newStudent.id,
				subjects,
				event.theme
			);

			await locals.pb.collection('participations').create({
				student: newStudent.id,
				event: params.id,
				subject: suggestedSubjectId,
				is_present: false,
				is_validated: false
			});
			return message(form, 'Élève créé et assigné automatiquement !');
		} catch (err) {
			console.error(err);
			return message(form, 'Erreur lors de la création rapide.', { status: 500 });
		}
	},

	updateEvent: async ({ request, locals, params }) => {
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

		const form = await superValidate(transformedData, zod4(eventSchema));

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

			await locals.pb.collection('events').update(params.id, {
				titre: form.data.titre,
				date: jsDate,
				statut: form.data.statut,
				theme: themeId
			});

			return message(form, 'Événement mis à jour !');
		} catch (err) {
			console.error('Update Event Error:', err);
			return message(form, "Impossible de mettre à jour l'événement", { status: 500 });
		}
	},

	remove: async ({ url, locals }) => {
		const id = url.searchParams.get('id');
		if (!id) return fail(400);

		try {
			const p = await locals.pb.collection('participations').getOne(id, {
				expand: 'subject'
			});

			if (p.is_validated) {
				const subject = p.expand?.subject;
				const xpValue = subject ? getSubjectXpValue(subject.niveaux) : 20;

				await locals.pb.collection('students').update(p.student, {
					'xp-': xpValue,
					'events_count-': 1
				});
			}

			await locals.pb.collection('participations').delete(id);
			return { success: true };
		} catch (err) {
			console.error('Error on remove participation:', err);
			return fail(500);
		}
	},

	deleteEvent: async ({ params, locals }) => {
		try {
			const participations = await locals.pb.collection('participations').getFullList({
				filter: `event = "${params.id}" && is_validated = true`,
				expand: 'subject'
			});

			for (const p of participations) {
				const subject = p.expand?.subject;
				const xpValue = subject ? getSubjectXpValue(subject.niveaux) : 20;
				await locals.pb.collection('students').update(p.student, {
					'xp-': xpValue,
					'events_count-': 1
				});
			}

			await locals.pb.collection('events').delete(params.id);
		} catch (err) {
			console.error('Error deleting event:', err);
			return fail(500);
		}

		throw redirect(303, '/');
	}
};
