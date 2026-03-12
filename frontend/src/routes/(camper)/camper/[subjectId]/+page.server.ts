import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export type StepValidation = {
	type: 'auto_qcm' | 'manual_manta';
	qcm_data?: {
		question: string;
		options: string[];
		correct_index: number;
	};
	unlock_code?: string;
};

export type SubjectStep = {
	id: string;
	title: string;
	content_markdown: string;
	type: 'theory' | 'exercise' | 'checkpoint';
	validation?: StepValidation;
};

export type SubjectStructure = {
	steps: SubjectStep[];
};

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.student) throw error(401, 'Non autorisé');

	try {
		// 1. Fetch Subject & Structure
		const subject = await locals.studentPb.collection('subjects').getOne(params.subjectId);
		const content = subject.content_structure as SubjectStructure | null;

		if (!content || !content.steps || content.steps.length === 0) {
			throw new Error('Ce sujet ne contient aucune étape configurée.');
		}

		// 2. Find the Active Event for this student & subject
		const participations = await locals.studentPb.collection('participations').getFullList({
			filter: `student = "${locals.student.id}" && subjects ~ "${subject.id}"`,
			sort: '-created'
		});

		if (participations.length === 0) {
			throw error(403, "Tu n'es pas assigné à ce sujet.");
		}
		const activeParticipation = participations[0];
		const eventId = activeParticipation.event;

		// 3. Find or Create the Progress Tracking Record
		let progress;
		try {
			progress = await locals.studentPb
				.collection('steps_progress')
				.getFirstListItem(
					`student="${locals.student.id}" && subject="${subject.id}" && event="${eventId}"`
				);
		} catch (e) {
			// First time opening this subject, initialize progress
			const firstStepId = content.steps[0].id;
			progress = await locals.studentPb.collection('steps_progress').create({
				student: locals.student.id,
				subject: subject.id,
				event: eventId,
				current_step_id: firstStepId,
				unlocked_step_id: firstStepId,
				status: 'active'
			});
		}

		return {
			subject,
			content,
			progress,
			eventId
		};
	} catch (err: any) {
		console.error('Error loading subject cockpit:', err);
		throw error(err.status || 500, err.message || 'Erreur lors du chargement du sujet');
	}
};

export const actions: Actions = {
	/**
	 * Generic action to complete a step.
	 * Handles both QCM validation and simple "Continue" for theory steps.
	 */
	validateStep: async ({ request, locals, params }) => {
		const data = await request.formData();
		const stepId = data.get('stepId') as string;
		const progressId = data.get('progressId') as string;
		const answerIndexStr = data.get('answerIndex') as string;

		try {
			const subject = await locals.studentPb.collection('subjects').getOne(params.subjectId);
			const content = subject.content_structure as SubjectStructure;
			const steps = content.steps || [];

			const stepIndex = steps.findIndex((s) => s.id === stepId);
			if (stepIndex === -1) return fail(400, { message: 'Étape introuvable' });

			const step = steps[stepIndex];

			// 1. If it's a QCM, validate the answer
			if (step.validation?.type === 'auto_qcm' && step.validation.qcm_data) {
				if (!answerIndexStr) return fail(400, { message: 'Veuillez sélectionner une réponse.' });
				const answerIndex = parseInt(answerIndexStr, 10);

				if (step.validation.qcm_data.correct_index !== answerIndex) {
					return fail(400, { incorrect: true, message: 'Mauvaise réponse. Essaie encore !' });
				}
			}

			// 2. Calculate next progress states
			const progress = await locals.studentPb.collection('steps_progress').getOne(progressId);
			const isLastStep = stepIndex === steps.length - 1;
			const nextStepId = !isLastStep ? steps[stepIndex + 1].id : 'COMPLETED';

			let newUnlockedId = progress.unlocked_step_id;
			const currentUnlockedIndex = steps.findIndex((s) => s.id === newUnlockedId);

			// Logic: Only advance the "Unlocked" boundary if the user is completing their furthest step
			if (newUnlockedId !== 'COMPLETED' && (isLastStep || stepIndex >= currentUnlockedIndex)) {
				newUnlockedId = nextStepId;
			}

			// 3. Update DB
			await locals.studentPb.collection('steps_progress').update(progressId, {
				// Move view to next step if not finished
				current_step_id: nextStepId === 'COMPLETED' ? stepId : nextStepId,
				unlocked_step_id: newUnlockedId,
				status: nextStepId === 'COMPLETED' ? 'completed' : 'active'
			});

			return { success: true };
		} catch (err) {
			console.error('Step Validation Error:', err);
			return fail(500, { message: 'Erreur serveur lors de la validation.' });
		}
	},

	changeStep: async ({ request, locals }) => {
		const data = await request.formData();
		const targetStepId = data.get('stepId') as string;
		const progressId = data.get('progressId') as string;

		try {
			await locals.studentPb.collection('steps_progress').update(progressId, {
				current_step_id: targetStepId
			});
			return { success: true };
		} catch (err) {
			return fail(500, { message: 'Erreur de navigation' });
		}
	}
};
