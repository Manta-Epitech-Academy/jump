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

// We track the user's decision explicitly
type ImportAction = {
	id: string; // Unique ID for frontend tracking
	csvData: CsvStudent;
	// "suggestedStatus" is what the algo thinks. "decision" is what the user chooses.
	suggestedStatus: 'NEW' | 'MERGE' | 'CONFLICT' | 'SIBLING';
	decision: 'CREATE_NEW' | 'LINK_EXISTING';
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	existingStudent?: any;
	matchReason?: string;
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
			let index = 0;

			for (const csvS of students) {
				index++;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				let existing: any = null;
				let status: ImportAction['suggestedStatus'] = 'NEW';
				let decision: ImportAction['decision'] = 'CREATE_NEW';
				let reason = '';

				const safeNom = csvS.nom.replace(/"/g, '\\"');
				const safePrenom = csvS.prenom.replace(/"/g, '\\"');

				// A. Email Check (Strong identifier)
				if (csvS.email) {
					try {
						existing = await locals.pb
							.collection('students')
							.getFirstListItem(`email = "${csvS.email}"`);

						// Check Names
						const dbName = (existing.nom || '').toLowerCase();
						const dbPrenom = (existing.prenom || '').toLowerCase();
						const csvNom = (csvS.nom || '').toLowerCase();
						const csvPrenom = (csvS.prenom || '').toLowerCase();

						if (dbName === csvNom && dbPrenom === csvPrenom) {
							status = 'MERGE';
							decision = 'LINK_EXISTING';
							reason = 'Email + Nom identiques';
						} else {
							// Sibling case: Same email found, but names differ
							status = 'SIBLING';
							decision = 'CREATE_NEW'; // Default to creating new for siblings
							reason = `Email partagé mais nom différent (DB: ${existing.prenom} ${existing.nom})`;
							// We keep 'existing' populated so the user can see who the email belongs to
						}
					} catch (_) {
						/* Not found by email */
					}
				}

				// B. Name Check (If not merged by email)
				if (status !== 'MERGE' && status !== 'SIBLING') {
					try {
						// Look for ANY student with same name
						const matches = await locals.pb.collection('students').getFullList({
							filter: `nom ~ "${safeNom}" && prenom ~ "${safePrenom}"`
						});

						if (matches.length === 1) {
							const match = matches[0];

							// Homonym Check: Same name, but emails differ?
							if (match.email && csvS.email && match.email !== csvS.email) {
								status = 'CONFLICT';
								decision = 'CREATE_NEW'; // Safer default, likely a homonym
								existing = match;
								reason = `Homonyme détecté : Nom identique, email différent (DB: ${match.email})`;
							} else {
								// Safe merge (or email missing in one side)
								status = 'MERGE';
								decision = 'LINK_EXISTING';
								existing = match;
								reason = 'Correspondance Nom/Prénom';
							}
						} else if (matches.length > 1) {
							// Multiple homonyms in DB
							status = 'CONFLICT';
							decision = 'CREATE_NEW';
							existing = matches[0]; // Just show the first one as example
							reason = 'Plusieurs homonymes trouvés en base.';
						}
					} catch (_) {
						/* Not found by name */
					}
				}

				analysis.push({
					id: `row-${index}`,
					csvData: csvS,
					suggestedStatus: status,
					decision: decision,
					existingStudent: existing,
					matchReason: reason
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

			// 2. Process Students based on USER DECISION
			for (const item of importList) {
				let studentId: string | undefined;

				// DECISION: LINK EXISTING
				if (item.decision === 'LINK_EXISTING' && item.existingStudent) {
					studentId = item.existingStudent.id;
				}

				// DECISION: CREATE NEW
				else {
					const studentData = {
						prenom: item.csvData.prenom,
						nom: item.csvData.nom,
						email: item.csvData.email,
						phone: item.csvData.phone,
						niveau: item.csvData.niveau,
						xp: 0,
						events_count: 0,
						parent_email: item.csvData.parentEmail,
						parent_phone: item.csvData.parentPhone
					};

					try {
						const newS = await locals.pb.collection('students').create(studentData);
						studentId = newS.id;
					} catch (err) {
						console.error(`Creation failed for ${item.csvData.nom}`, err);
					}
				}

				// 3. Create Participation
				if (studentId) {
					try {
						// Check if not already in event (double safety)
						const check = await locals.pb.collection('participations').getList(1, 1, {
							filter: `student = "${studentId}" && event = "${newEventId}"`
						});

						if (check.totalItems === 0) {
							const subjectId = await suggestBestSubject(locals.pb, studentId, subjects, null);
							await locals.pb.collection('participations').create({
								student: studentId,
								event: newEventId,
								subject: subjectId,
								is_present: false,
								is_validated: false
							});
						}
					} catch (err) {
						console.error(`Failed to assign student ${studentId}`, err);
					}
				}
			}
		} catch (err) {
			console.error('Final Import Error:', err);
			return fail(500, { error: "Erreur lors de l'import final" });
		}

		throw redirect(303, `/events/${newEventId}/builder`);
	}
};
