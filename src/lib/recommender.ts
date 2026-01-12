import type { TypedPocketBase } from './pocketbase-types';
import { getActivityXpValue } from './xp';

/**
 * Intelligent Algorithm to guess the best activity for a student.
 * 1. Filters activities by the student's school level.
 * 2. Excludes activities the student has already validated.
 * 3. Prioritizes activities matching the Session Theme.
 * 4. Prioritizes activities with higher XP values (progression).
 */
export async function suggestBestActivity(
	pb: TypedPocketBase,
	studentId: string,
	activities: any[],
	sessionThemeId?: string | null
) {
	try {
		// 1. Get student details
		const student = await pb.collection('students').getOne(studentId);

		// 2. Get student's validated history to avoid repeats
		const validatedParticipations = await pb.collection('participations').getFullList({
			filter: `student = "${studentId}" && is_validated = true`,
			fields: 'activity'
		});
		const validatedActivityIds = validatedParticipations.map((p) => p.activity);

		// 3. Filter and Score activities
		const recommendations = activities
			.filter((act) => {
				// Must match student level
				const levelMatch = act.niveaux && act.niveaux.includes(student.niveau);
				// Must not be already validated
				const alreadyDone = validatedActivityIds.includes(act.id);
				return levelMatch && !alreadyDone;
			})
			.map((act) => {
				let score = getActivityXpValue(act.niveaux);

				// Boost score if activity themes include the session theme
				if (sessionThemeId && act.themes && act.themes.includes(sessionThemeId)) {
					score += 1000;
				}

				return {
					activity: act,
					score
				};
			})
			.sort((a, b) => b.score - a.score); // Highest Score (Theme + XP) first

		return recommendations.length > 0 ? recommendations[0].activity.id : null;
	} catch (err) {
		console.error('Recommender error:', err);
		return null;
	}
}
