import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { eventSchema } from '$lib/validation/events';
import { CalendarDateTime, getLocalTimeZone } from '@internationalized/date';
import { parseEventImportCsv, type CsvStudent } from '$lib/csvUtils';
import { suggestBestSubject } from '$lib/recommender';

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
	csvData: CsvStudent;
	status: 'NEW' | 'MATCH_EMAIL' | 'MATCH_NAME' | 'CONFLICT';
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	existingStudent?: any;
	message: string;
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
				const [year, month, day] = dateStr.split('-').map(Number);
				const [hour, minute] = timeStr.split(':').map(Number);
				calendarDateTime = new CalendarDateTime(year, month, day, hour, minute);
			} catch (e) {
				// Fallback handled by validation
			}
		}

		const transformedData = {
			titre: formData.get('titre'),
			date: calendarDateTime,
			time: timeStr,
			statut: formData.get('statut'),
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
			// Find or create theme
			let themeId: string | null = null;
			if (form.data.theme && form.data.theme.trim() !== '') {
				const existing = await locals.pb
					.collection('themes')
					.getList(1, 1, { filter: `nom = "${form.data.theme}"` });

				if (existing.items.length > 0) {
					themeId = existing.items[0].id;
				} else {
					const created = await locals.pb.collection('themes').create({ nom: form.data.theme });
					themeId = created.id;
				}
			}

			if (!calendarDateTime) throw new Error('Date invalide');
			const jsDate = calendarDateTime.toDate(getLocalTimeZone());

			const payload = {
				titre: form.data.titre,
				date: jsDate,
				statut: form.data.statut,
				theme: themeId
			};

			const record = await locals.pb.collection('events').create(payload);
			newEventId = record.id;
		} catch (err) {
			console.error('Erreur création événement:', err);
			return message(form, 'Erreur technique lors de la création.', {
				status: 500
			});
		}

		throw redirect(303, `/events/${newEventId}/builder`);
	},

	// STEP 1: Analyze CSV content and check against DB
	analyzeCampaign: async ({ request, locals }) => {
		const formData = await request.formData();
		const file = formData.get('csvFile') as File;

		if (!file || file.size === 0) {
			return fail(400, { error: 'Veuillez sélectionner un fichier CSV valide.' });
		}

		try {
			// ENCODING HANDLING:
			let text = await file.text();
			if (text.includes('\ufffd')) {
				console.log('Encoding fallback triggered: converting from windows-1252');
				const buffer = await file.arrayBuffer();
				const decoder = new TextDecoder('windows-1252');
				text = decoder.decode(buffer);
			}

			const { eventName, eventDate, students } = await parseEventImportCsv(text);

			const analysis: ImportAction[] = [];

			for (const csvS of students) {
				let status: ImportAction['status'] = 'NEW';
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				let existing: any = null;
				let msg = 'Nouveau dossier étudiant';

				// 1. Check by Email
				if (csvS.email) {
					try {
						existing = await locals.pb
							.collection('students')
							.getFirstListItem(`email = "${csvS.email}"`);
						status = 'MATCH_EMAIL';
						msg = 'Compte existant trouvé (Email)';
					} catch (_) {
						/* ignore */
					}
				}

				// 2. Check by Name if not found
				if (!existing) {
					try {
						const safeNom = csvS.nom.replace(/"/g, '\\"');
						const safePrenom = csvS.prenom.replace(/"/g, '\\"');

						existing = await locals.pb
							.collection('students')
							.getFirstListItem(`nom ~ "${safeNom}" && prenom ~ "${safePrenom}"`);

						if (csvS.email && existing.email && csvS.email !== existing.email) {
							status = 'CONFLICT';
							msg = 'ATTENTION : Homonyme avec email différent';
						} else {
							status = 'MATCH_NAME';
							msg = 'Compte existant trouvé (Nom/Prénom)';
						}
					} catch (_) {
						/* ignore */
					}
				}

				analysis.push({
					csvData: csvS,
					status,
					existingStudent: existing,
					message: msg
				});
			}

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

	// STEP 2: Confirm and Write to DB
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
			const eventRecord = await locals.pb.collection('events').create({
				titre: eventName,
				date: new Date(eventDateStr),
				statut: 'planifiee'
			});
			newEventId = eventRecord.id;

			const subjects = await locals.pb.collection('subjects').getFullList();

			// 2. Process Students
			for (const item of importList) {
				let studentId = item.existingStudent?.id;

				if (!studentId) {
					try {
						const newS = await locals.pb.collection('students').create({
							prenom: item.csvData.prenom,
							nom: item.csvData.nom,
							email: item.csvData.email,
							phone: item.csvData.phone,
							niveau: item.csvData.niveau,
							xp: 0,
							events_count: 0,
							// NEW FIELDS (ensure these exist in DB)
							parent_email: item.csvData.parentEmail,
							parent_phone: item.csvData.parentPhone
						});
						studentId = newS.id;
					} catch (err) {
						console.error(`Failed to create student ${item.csvData.nom}`, err);
						continue;
					}
				}

				// 3. Create Participation
				try {
					const subjectId = await suggestBestSubject(locals.pb, studentId, subjects, null);
					await locals.pb.collection('participations').create({
						student: studentId,
						event: newEventId,
						subject: subjectId,
						is_present: false,
						is_validated: false
					});
				} catch (err) {
					console.error(`Failed to assign student ${studentId}`, err);
				}
			}
		} catch (err) {
			console.error('Final Import Error:', err);
			return fail(500, { error: "Erreur lors de l'import final" });
		}

		throw redirect(303, `/events/${newEventId}/builder`);
	}
};
