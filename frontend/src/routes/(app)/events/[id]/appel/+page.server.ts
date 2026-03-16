import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { getTotalXp } from '$lib/xp';
import type {
	ParticipationsResponse,
	StudentsResponse,
	SubjectsResponse
} from '$lib/pocketbase-types';

type ParticipationExpand = {
	student?: StudentsResponse;
	subjects?: SubjectsResponse[];
};

export const load: PageServerLoad = async ({ locals, params }) => {
	try {
		const event = await locals.pb.collection('events').getOne(params.id, {
			expand: 'theme'
		});

		const rawParticipations = await locals.pb
			.collection('participations')
			.getFullList<ParticipationsResponse<ParticipationExpand>>({
				filter: `event = "${event.id}"`,
				expand: 'student,subjects'
			});

		const participations = rawParticipations.sort((a, b) => {
			const nomA = a.expand?.student?.nom?.toUpperCase() ?? '';
			const nomB = b.expand?.student?.nom?.toUpperCase() ?? '';
			if (nomA < nomB) return -1;
			if (nomA > nomB) return 1;

			const prenomA = a.expand?.student?.prenom?.toLowerCase() ?? '';
			const prenomB = b.expand?.student?.prenom?.toLowerCase() ?? '';
			return prenomA.localeCompare(prenomB);
		});

		// Fetch all step_progress for this event to populate initial Manta-Signals
		const progressData = await locals.pb.collection('steps_progress').getFullList({
			filter: `event = "${event.id}"`,
			requestKey: null
		});

		return {
			event,
			participations,
			progressData
		};
	} catch (e) {
		console.error(e);
		throw error(404, 'Événement introuvable');
	}
};

export const actions: Actions = {
	togglePresent: async ({ request, locals }) => {
		const data = await request.formData();
		const id = data.get('id') as string;
		const currentState = data.get('state') === 'true';

		try {
			const p = await locals.pb
				.collection('participations')
				.getOne<ParticipationsResponse<ParticipationExpand>>(id, {
					expand: 'subjects'
				});

			const studentId = p.student;
			const isNowPresent = !currentState;

			// Sum XP of all assigned subjects
			const subjects = p.expand?.subjects || [];
			const xpValue = getTotalXp(subjects);

			const updatePayload: any = {
				is_present: isNowPresent
			};

			// If marking absent, reset delay to 0
			if (!isNowPresent) {
				updatePayload.delay = 0;
			}

			await locals.pb.collection('participations').update(id, updatePayload);

			// Only update student stats if status actually changed
			if (p.is_present !== isNowPresent) {
				if (isNowPresent) {
					await locals.pb.collection('students').update(studentId, {
						'xp+': xpValue,
						'events_count+': 1
					});
				} else {
					const student = await locals.pb.collection('students').getOne(studentId);
					const currentXp = student.xp ?? 0;
					const currentEventsCount = student.events_count ?? 0;

					await locals.pb.collection('students').update(studentId, {
						'xp-': Math.min(xpValue, currentXp),
						'events_count-': Math.min(1, currentEventsCount)
					});
				}
			}

			return { success: true };
		} catch (err) {
			console.error('Error updating presence/XP:', err);
			return fail(500, { error: 'Erreur mise à jour présence' });
		}
	},

	updateDelay: async ({ request, locals }) => {
		const data = await request.formData();
		const id = data.get('id') as string;
		const delayStr = data.get('delay') as string;
		const delay = parseInt(delayStr, 10);

		if (isNaN(delay)) return fail(400);

		try {
			const p = await locals.pb
				.collection('participations')
				.getOne<ParticipationsResponse<ParticipationExpand>>(id, {
					expand: 'subjects'
				});

			// If previously absent and now marking late, they become present
			const wasAbsent = !p.is_present;

			await locals.pb.collection('participations').update(id, {
				delay: delay,
				is_present: true // Implicitly present if late
			});

			if (wasAbsent) {
				const subjects = p.expand?.subjects || [];
				const xpValue = getTotalXp(subjects);
				await locals.pb.collection('students').update(p.student, {
					'xp+': xpValue,
					'events_count+': 1
				});
			}

			return { success: true };
		} catch (err) {
			console.error('Error updating delay:', err);
			return fail(500, { error: 'Erreur mise à jour retard' });
		}
	},

	updateNote: async ({ request, locals }) => {
		const data = await request.formData();
		const id = data.get('id') as string;
		const note = data.get('note') as string;

		try {
			await locals.pb.collection('participations').update(id, {
				note: note,
				note_author: locals.user?.id
			});
			return { success: true };
		} catch (err) {
			return fail(500, { error: 'Erreur sauvegarde note' });
		}
	},

	unlockStep: async ({ request, locals }) => {
		const data = await request.formData();
		const progressId = data.get('progressId') as string;

		try {
			const progress = await locals.pb.collection('steps_progress').getOne(progressId);
			const subject = await locals.pb.collection('subjects').getOne(progress.subject);
			const content = subject.content_structure as { steps?: { id: string }[] };
			const steps = content.steps || [];

			const currentIndex = steps.findIndex((s: any) => s.id === progress.current_step_id);
			if (currentIndex === -1) return fail(400);

			const isLastStep = currentIndex === steps.length - 1;
			const nextStepId = !isLastStep ? steps[currentIndex + 1].id : 'COMPLETED';

			await locals.pb.collection('steps_progress').update(progressId, {
				current_step_id: nextStepId === 'COMPLETED' ? progress.current_step_id : nextStepId,
				unlocked_step_id: nextStepId,
				status: nextStepId === 'COMPLETED' ? 'completed' : 'active'
			});

			return { success: true };
		} catch (err) {
			console.error('Remote unlock error:', err);
			return fail(500, { error: 'Erreur lors du déblocage distant' });
		}
	},

	dismissAlert: async ({ request, locals }) => {
		const data = await request.formData();
		const progressId = data.get('progressId') as string;
		try {
			await locals.pb.collection('steps_progress').update(progressId, { status: 'active' });
			return { success: true };
		} catch (err) {
			return fail(500, { error: "Erreur lors de l'annulation de l'alerte" });
		}
	}
};
