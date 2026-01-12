import type { TypedPocketBase } from './pocketbase-types';
import { getSubjectXpValue } from './xp';

/**
 * Intelligent Algorithm to guess the best subject for a student.
 * 1. Filters subjects by the student's school level.
 * 2. Excludes subjects the student has already validated.
 * 3. Prioritizes subjects matching the Event Theme.
 * 4. Prioritizes subjects with higher XP values (progression).
 */
export async function suggestBestSubject(
	pb: TypedPocketBase,
	studentId: string,
	subjects: any[],
	eventThemeId?: string | null
) {
	try {
		// 1. Get student details
		const student = await pb.collection('students').getOne(studentId);

		// 2. Get student's validated history to avoid repeats
		const validatedParticipations = await pb.collection('participations').getFullList({
			filter: `student = "${studentId}" && is_validated = true`,
			fields: 'subject'
		});
		const validatedSubjectIds = validatedParticipations.map((p) => p.subject);

		// 3. Filter and Score subjects
		const recommendations = subjects
			.filter((sub) => {
				// Must match student level
				const levelMatch = sub.niveaux && sub.niveaux.includes(student.niveau);
				// Must not be already validated
				const alreadyDone = validatedSubjectIds.includes(sub.id);
				return levelMatch && !alreadyDone;
			})
			.map((sub) => {
				let score = getSubjectXpValue(sub.niveaux);

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

		return recommendations.length > 0 ? recommendations[0].subject.id : null;
	} catch (err) {
		console.error('Recommender error:', err);
		return null;
	}
}
