import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { eventSchema } from '$lib/validation/events';
import { CalendarDateTime } from '@internationalized/date';
import { parseEventImportCsv, type CsvStudent } from '$lib/csvUtils';
import { suggestBestSubject } from '$lib/recommender';
import { createScoped } from '$lib/pocketbase';
import { StudentsNiveauOptions } from '$lib/pocketbase-types';

export const load: PageServerLoad = async ({ locals }) => {
	const themes = await locals.pb.collection('themes').getFullList({
		sort: 'nom'
	});

	const form = await superValidate(zod4(eventSchema));

	return {
		themes,
		form
	};
};

type ImportAction = {
	id: string;
	csvData: CsvStudent;
	suggestedStatus: 'NEW' | 'MERGE' | 'CONFLICT' | 'SIBLING';
	decision: 'CREATE_NEW' | 'LINK_EXISTING';
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	existingStudent?: any;
	matchReason?: string;
	bring_pc: boolean;
};

export const actions: Actions = {
	createManual: async ({ request, locals }) => {
		const formData = await request.formData();

		const dateStr = formData.get('date') as string;
		const timeStr = formData.get('time') as string;
		const themeInput = formData.get('theme') as string;

		let calendarDateTime: CalendarDateTime | undefined;
		if (dateStr && timeStr) {
			try {
				const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
				const [hour, minute] = timeStr.split(':').map(Number);
				calendarDateTime = new CalendarDateTime(year, month, day, hour, minute);
			} catch (e) {
				// handled by validation
			}
		}

		const transformedData = {
			titre: (formData.get('titre') as string) || '',
			date: calendarDateTime,
			time: timeStr,
			theme: themeInput
		};

		const form = await superValidate(transformedData, zod4(eventSchema));

		if (form.data.date && typeof form.data.date !== 'string') {
			form.data.date = form.data.date.toString();
		}

		if (!form.valid) {
			return fail(400, { form });
		}

		let newEventId = '';

		try {
			let themeId: string | null = null;
			if (form.data.theme && form.data.theme.trim() !== '') {
				const existing = await locals.pb
					.collection('themes')
					.getList(1, 1, { filter: `nom = "${form.data.theme}"` });

				if (existing.items.length > 0) {
					themeId = existing.items[0].id;
				} else {
					const created = await createScoped(locals.pb, 'themes', { nom: form.data.theme });
					themeId = created.id;
				}
			}

			if (!calendarDateTime) throw new Error('Date invalide');

			const jsDate = calendarDateTime.toDate('Europe/Paris');

			const payload = {
				titre: form.data.titre,
				date: jsDate.toISOString(),
				theme: themeId ?? undefined
			};

			const record = await createScoped(locals.pb, 'events', payload);
			newEventId = record.id;
		} catch (err) {
			console.error('Erreur création événement:', err);
			return message(form, 'Erreur technique lors de la création.', {
				status: 500
			});
		}

		throw redirect(303, resolve(`/events/${newEventId}/builder`));
	},

	analyzeCampaign: async ({ request, locals }) => {
		const formData = await request.formData();
		const file = formData.get('csvFile') as File;

		if (!file || file.size === 0) {
			return fail(400, { error: 'Veuillez sélectionner un fichier CSV valide.' });
		}

		try {
			let text = await file.text();
			if (text.includes('\ufffd')) {
				const buffer = await file.arrayBuffer();
				const decoder = new TextDecoder('windows-1252');
				text = decoder.decode(buffer);
			}

			const { eventName, eventDate, students } = await parseEventImportCsv(text);

			const analysis = await Promise.all(
				students.map(async (csvS, i) => {
					const index = i + 1;
					let existing: any = null;
					let status: ImportAction['suggestedStatus'] = 'NEW';
					let decision: ImportAction['decision'] = 'CREATE_NEW';
					let reason = '';

					const safeNom = csvS.nom.replace(/"/g, '\\"');
					const safePrenom = csvS.prenom.replace(/"/g, '\\"');

					try {
						existing = await locals.pb
							.collection('students')
							.getFirstListItem(
								`nom = "${safeNom}" && prenom = "${safePrenom}" && email = "${csvS.email}"`,
								{ requestKey: null }
							);
						status = 'MERGE';
						decision = 'LINK_EXISTING';
						reason = 'Profil identique trouvé (Nom + Email)';
					} catch (_) {
						if (csvS.email) {
							try {
								const siblingMatch = await locals.pb
									.collection('students')
									.getFirstListItem(`email = "${csvS.email}"`, { requestKey: null });

								status = 'SIBLING';
								decision = 'CREATE_NEW';
								existing = siblingMatch;
								reason = `Fratrie détectée : Email identique à ${siblingMatch.prenom} ${siblingMatch.nom}`;
							} catch (__) {
								/* Truly new email */
							}
						}

						if (status === 'NEW') {
							try {
								const nameMatch = await locals.pb
									.collection('students')
									.getFirstListItem(`nom = "${safeNom}" && prenom = "${safePrenom}"`, {
										requestKey: null
									});

								status = 'CONFLICT';
								decision = 'CREATE_NEW';
								existing = nameMatch;
								reason = 'Nom identique mais email différent (Homonyme possible)';
							} catch (___) {
								/* Truly new person */
							}
						}
					}

					return {
						id: `row-${index}`,
						csvData: csvS,
						suggestedStatus: status,
						decision: decision,
						existingStudent: existing,
						matchReason: reason,
						bring_pc: true
					} as ImportAction;
				})
			);

			return {
				analysisSuccess: true,
				eventName,
				eventDate: eventDate.toISOString(),
				analysisData: analysis
			};
		} catch (err) {
			console.error('CSV Analysis Error:', err);
			return fail(500, { error: "Erreur lors de l'analyse : " + (err as Error).message });
		}
	},

	confirmCampaignImport: async ({ request, locals }) => {
		const formData = await request.formData();
		const rawData = formData.get('importData') as string;
		const eventName = formData.get('eventName') as string;
		const eventDateStr = formData.get('eventDate') as string;

		if (!rawData) return fail(400, { error: 'Données manquantes' });

		const importList = JSON.parse(rawData) as ImportAction[];
		let newEventId = '';

		try {
			// 1. Create Event
			const eventRecord = await createScoped(locals.pb, 'events', {
				titre: eventName,
				date: new Date(eventDateStr).toISOString()
			});
			newEventId = eventRecord.id;

			const subjects = await locals.pb.collection('subjects').getFullList();

			// 2. Process Students in Parallel
			await Promise.all(
				importList.map(async (item) => {
					let studentId: string | undefined;

					if (item.decision === 'LINK_EXISTING' && item.existingStudent) {
						studentId = item.existingStudent.id;
					} else {
						// CREATE NEW STUDENT
						const studentData = {
							prenom: item.csvData.prenom,
							nom: item.csvData.nom,
							email: item.csvData.email,
							phone: item.csvData.phone,
							niveau: item.csvData.niveau as StudentsNiveauOptions,
							xp: 0,
							events_count: 0,
							parent_email: item.csvData.parentEmail,
							parent_phone: item.csvData.parentPhone
						};

						try {
							const newS = await createScoped(locals.pb, 'students', studentData);
							studentId = newS.id;
						} catch (err) {
							console.error(`Creation failed for ${item.csvData.nom}`, err);
						}
					}

					if (studentId) {
						try {
							// Check existence
							const check = await locals.pb.collection('participations').getList(1, 1, {
								filter: `student = "${studentId}" && event = "${newEventId}"`,
								requestKey: null
							});

							if (check.totalItems === 0) {
								const subjectId = await suggestBestSubject(locals.pb, studentId, subjects, null);
								await createScoped(locals.pb, 'participations', {
									student: studentId,
									event: newEventId,
									subjects: subjectId ? [subjectId] : [],
									is_present: false,
									bring_pc: item.bring_pc
								});
							}
						} catch (err) {
							console.error(`Failed to assign student ${studentId}`, err);
						}
					}
				})
			);
		} catch (err) {
			console.error('Final Import Error:', err);
			return fail(500, { error: "Erreur lors de l'import final" });
		}

		throw redirect(303, resolve(`/events/${newEventId}/builder`));
	}
};
