import type { TypedPocketBase } from './pocketbase-types';
import { getSubjectXpValue } from './xp';

/**
 * Intelligent Algorithm to guess the best subject for a student.
 * 1. Matches the student's difficulty level directly.
 * 2. Excludes subjects the student has already completed (is_present).
 * 3. Prioritizes subjects matching the Event Theme.
 * 4. Prioritizes subjects with higher XP values.
 */
export async function suggestBestSubject(
	pb: TypedPocketBase,
	studentId: string,
	subjects: any[],
	eventThemeId?: string | null,
	currentSubjectIds: string[] = []
) {
	try {
		// 1. Get student details to find their difficulty level
		const student = await pb.collection('students').getOne(studentId, { requestKey: null });

		const studentDifficulty = student.niveau_difficulte || 'Débutant';

		// 2. Get student's presence history to avoid repeats
		const completedParticipations = await pb.collection('participations').getFullList({
			filter: `student = "${studentId}" && is_present = true`,
			fields: 'subjects',
			requestKey: null
		});

		// Flatten all completed subjects
		const completedSubjectIds = new Set<string>();
		completedParticipations.forEach((p) => {
			if (p.subjects && Array.isArray(p.subjects)) {
				p.subjects.forEach((s) => completedSubjectIds.add(s));
			}
		});

		// 3. Filter and Score subjects
		const recommendations = subjects
			.filter((sub) => {
				// Must match the student's assigned difficulty
				const difficultyMatch = sub.difficulte === studentDifficulty;

				// Must not be already done
				const alreadyDone = completedSubjectIds.has(sub.id);

				// Must not be currently assigned
				const currentlyAssigned = currentSubjectIds.includes(sub.id);

				return difficultyMatch && !alreadyDone && !currentlyAssigned;
			})
			.map((sub) => {
				let score = getSubjectXpValue(sub.difficulte);

				// Boost score if subject themes include the event theme
				if (eventThemeId && sub.themes && sub.themes.includes(eventThemeId)) {
					score += 1000;
				}

				return {
					subject: sub,
					score
				};
			})
			.sort((a, b) => b.score - a.score); // Highest Score (Theme + XP) first

		// Fallback: If no strict match found (e.g. they finished all "Débutant" subjects),
		// try suggesting the next tier up (e.g. "Intermédiaire")
		if (recommendations.length === 0 && studentDifficulty === 'Débutant') {
			const fallback = subjects.find(s =>
				s.difficulte === 'Intermédiaire' &&
				!completedSubjectIds.has(s.id) &&
				!currentSubjectIds.includes(s.id)
			);
			return fallback ? fallback.id : null;
		}

		return recommendations.length > 0 ? recommendations[0].subject.id : null;
	} catch (err) {
		console.error('Recommender error:', err);
		return null;
	}
}
