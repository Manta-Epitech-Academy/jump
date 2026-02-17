import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { addParticipantSchema, eventSchema } from '$lib/validation/events';
import { studentSchema } from '$lib/validation/students';
import { getTotalXp } from '$lib/xp';
import { suggestBestSubject } from '$lib/recommender';
import { createScoped } from '$lib/pocketbase';
import {
	type ParticipationsResponse,
	type StudentsResponse,
	type SubjectsResponse,
	StudentsNiveauOptions
} from '$lib/pocketbase-types';
import { CalendarDateTime } from '@internationalized/date';
import { ClientResponseError } from 'pocketbase';

type ParticipationExpand = {
	student?: StudentsResponse;
	subjects?: SubjectsResponse[];
};

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

	const participationsRaw = await locals.pb
		.collection('participations')
		.getFullList<ParticipationsResponse<ParticipationExpand>>({
			filter: `event = "${event.id}"`,
			expand: 'student,subjects',
			sort: '-created',
			requestKey: null
		});

	const participations = await Promise.all(
		participationsRaw.map(async (p) => {
			const student = p.expand?.student;
			const currentSubjects = p.expand?.subjects || [];

			const alerts: { type: 'danger' | 'warning'; message: string }[] = [];

			if (student && currentSubjects.length > 0) {
				for (const subject of currentSubjects) {
					const history = await locals.pb.collection('participations').getList(1, 1, {
						filter: `student = "${student.id}" && subjects ~ "${subject.id}" && is_present = true && event != "${event.id}"`,
						requestKey: null
					});

					if (history.totalItems > 0) {
						alerts.push({
							type: 'danger',
							message: `DÉJÀ FAIT : L'élève a déjà validé "${subject.nom}".`
						});
					}

					if (
						subject.niveaux &&
						student.niveau &&
						!subject.niveaux.includes(
							student.niveau as unknown as (typeof subject.niveaux)[number]
						)
					) {
						alerts.push({
							type: 'warning',
							message: `NIVEAU : "${subject.nom}" n'est pas recommandé pour le niveau ${student.niveau}.`
						});
					}
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
		expand: 'themes,campus',
		requestKey: null
	});

	const themes = await locals.pb.collection('themes').getFullList({
		sort: 'nom',
		requestKey: null
	});

	const eventDate = new Date(event.date);
	const dateString = eventDate.toISOString().split('T')[0];

	const timeParts = new Intl.DateTimeFormat('fr-FR', {
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
		timeZone: 'Europe/Paris'
	}).formatToParts(eventDate);

	const hours = timeParts.find((p) => p.type === 'hour')?.value || '00';
	const minutes = timeParts.find((p) => p.type === 'minute')?.value || '00';
	const timeString = `${hours}:${minutes}`;

	const editForm = await superValidate(
		{
			titre: event.titre,
			theme: (event as { expand?: { theme?: { nom?: string } } }).expand?.theme?.nom || '',
			date: dateString,
			time: timeString,
			notes: event.notes || ''
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

			const event = await locals.pb.collection('events').getOne(params.id);

			const subjects = await locals.pb.collection('subjects').getFullList();
			const suggestedSubjectId = await suggestBestSubject(
				locals.pb,
				form.data.studentId,
				subjects,
				event.theme
			);

			await createScoped(locals.pb, 'participations', {
				student: form.data.studentId,
				event: params.id,
				subjects: suggestedSubjectId ? [suggestedSubjectId] : [],
				is_present: false
			});

			return message(form, 'Élève ajouté avec une suggestion intelligente !');
		} catch (err) {
			console.error(err);
			return message(form, "Erreur technique lors de l'ajout.", { status: 500 });
		}
	},

	updateSubjects: async ({ request, locals }) => {
		const data = await request.formData();
		const participationId = data.get('participationId') as string;
		const subjectsRaw = data.get('subjectIds') as string;
		const subjectIds = subjectsRaw ? subjectsRaw.split(',').filter(Boolean) : [];

		try {
			await locals.pb.collection('participations').update(participationId, {
				subjects: subjectIds
			});
			return { success: true };
		} catch (err) {
			console.error(err);
			return fail(500);
		}
	},

	autoAssignAll: async ({ params, locals }) => {
		try {
			const unassigned = await locals.pb
				.collection('participations')
				.getFullList<ParticipationsResponse<ParticipationExpand>>({
					filter: `event = "${params.id}" && subjects:length = 0`,
					expand: 'student'
				});

			if (unassigned.length === 0) {
				return { success: true, message: 'Aucun élève à assigner.' };
			}

			const subjects = await locals.pb.collection('subjects').getFullList();
			const event = await locals.pb.collection('events').getOne(params.id, { expand: 'theme' });

			let count = 0;

			for (const p of unassigned) {
				const suggestedId = await suggestBestSubject(
					locals.pb,
					p.expand?.student?.id ?? '',
					subjects,
					event.theme
				);

				if (suggestedId) {
					await locals.pb.collection('participations').update(p.id, {
						subjects: [suggestedId]
					});
					count++;
				}
			}

			return { success: true, message: `${count} élèves assignés automatiquement !` };
		} catch (err) {
			console.error('Auto-assign error:', err);
			return fail(500, { message: "Erreur lors de l'auto-assignation" });
		}
	},

	quickCreateStudent: async ({ request, locals, params }) => {
		const form = await superValidate(request, zod4(studentSchema));
		if (!form.valid) return fail(400, { form });

		try {
			// SCOPED creation
			const newStudent = await createScoped(locals.pb, 'students', {
				...form.data,
				niveau: form.data.niveau as StudentsNiveauOptions
			});

			const event = await locals.pb.collection('events').getOne(params.id);

			const subjects = await locals.pb.collection('subjects').getFullList();
			const suggestedSubjectId = await suggestBestSubject(
				locals.pb,
				newStudent.id,
				subjects,
				event.theme
			);

			await createScoped(locals.pb, 'participations', {
				student: newStudent.id,
				event: params.id,
				subjects: suggestedSubjectId ? [suggestedSubjectId] : [],
				is_present: false
			});
			return message(form, 'Élève créé et assigné automatiquement !');
		} catch (err) {
			if (err instanceof ClientResponseError && err.status === 400) {
				return message(form, 'Un élève identique (Même nom, prénom et email) existe déjà.', {
					status: 400
				});
			}
			console.error(err);
			return message(form, 'Erreur lors de la création rapide.', { status: 500 });
		}
	},

	updateEvent: async ({ request, locals, params }) => {
		const formData = await request.formData();

		const dateStr = formData.get('date') as string;
		const timeStr = formData.get('time') as string;
		const themeInput = formData.get('theme') as string;
		const notesInput = formData.get('notes') as string;

		const transformedData = {
			titre: (formData.get('titre') as string) || '',
			date: dateStr,
			time: timeStr,
			theme: themeInput,
			notes: notesInput
		};

		const form = await superValidate(transformedData, zod4(eventSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			const currentEvent = await locals.pb.collection('events').getOne(params.id);
			const oldThemeId = currentEvent.theme;

			if (!dateStr || !timeStr) throw new Error('Date ou heure manquante');

			const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
			const [hour, minute] = timeStr.split(':').map(Number);
			const cdt = new CalendarDateTime(year, month, day, hour, minute);
			const jsDate = cdt.toDate('Europe/Paris');

			if (isNaN(jsDate.getTime())) {
				return message(form, 'Format de date invalide', { status: 400 });
			}

			let newThemeId: string | null = null;
			if (form.data.theme && form.data.theme.trim() !== '') {
				const existing = await locals.pb
					.collection('themes')
					.getList(1, 1, { filter: `nom = "${form.data.theme.replace(/"/g, '\\"')}"` });

				if (existing.items.length > 0) {
					newThemeId = existing.items[0].id;
				} else {
					const created = await createScoped(locals.pb, 'themes', { nom: form.data.theme });
					newThemeId = created.id;
				}
			}

			await locals.pb.collection('events').update(params.id, {
				titre: form.data.titre,
				date: jsDate.toISOString(),
				theme: newThemeId ?? undefined,
				notes: form.data.notes
			});

			if (oldThemeId !== newThemeId) {
				const participations = await locals.pb.collection('participations').getFullList({
					filter: `event = "${params.id}"`,
					requestKey: null
				});

				const subjects = await locals.pb.collection('subjects').getFullList();

				for (const p of participations) {
					// Only re-suggest for those without subjects or specifically for the first subject slot
					if (!p.is_present && (!p.subjects || p.subjects.length === 0)) {
						const newSubjectId = await suggestBestSubject(
							locals.pb,
							p.student,
							subjects,
							newThemeId
						);

						if (newSubjectId) {
							await locals.pb.collection('participations').update(p.id, {
								subjects: [newSubjectId]
							});
						}
					}
				}
				return message(form, 'Événement mis à jour et sujets recalculés !');
			}

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
			const p = await locals.pb
				.collection('participations')
				.getOne<ParticipationsResponse<ParticipationExpand>>(id, {
					expand: 'subjects'
				});

			if (p.is_present) {
				const subjects = p.expand?.subjects || [];
				const xpValue = getTotalXp(subjects);

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
			const participations = await locals.pb
				.collection('participations')
				.getFullList<ParticipationsResponse<ParticipationExpand>>({
					filter: `event = "${params.id}" && is_present = true`,
					expand: 'subjects'
				});

			for (const p of participations) {
				const subjects = p.expand?.subjects || [];
				const xpValue = getTotalXp(subjects);
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

		throw redirect(303, resolve('/'));
	}
};
