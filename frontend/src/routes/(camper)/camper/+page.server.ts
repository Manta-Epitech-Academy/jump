import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { now } from '@internationalized/date';
import type {
	ParticipationsResponse,
	EventsResponse,
	SubjectsResponse
} from '$lib/pocketbase-types';

type ParticipationExpand = {
	event: EventsResponse;
	subjects: SubjectsResponse[];
};

export const load: PageServerLoad = async ({ locals }) => {
	// Security guard: Ensure we have a logged-in student
	if (!locals.student) {
		throw error(401, 'Non autorisé');
	}

	try {
		// Calculate boundaries for "Today" in the user's timezone (Europe/Paris)
		const parisNow = now('Europe/Paris');
		const startOfDay = parisNow.set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
		const endOfDay = parisNow.set({ hour: 23, minute: 59, second: 59, millisecond: 999 });

		// PocketBase expects UTC datetime strings in the format "YYYY-MM-DD HH:mm:ss.SSSZ"
		const filterDateStart = startOfDay.toDate().toISOString().replace('T', ' ');
		const filterDateEnd = endOfDay.toDate().toISOString().replace('T', ' ');

		// Fetch participations for today
		const participations = await locals.studentPb
			.collection('participations')
			.getFullList<ParticipationsResponse<ParticipationExpand>>({
				filter: `student = "${locals.student.id}" && event.date >= "${filterDateStart}" && event.date <= "${filterDateEnd}"`,
				expand: 'event,subjects',
				sort: 'event.date'
			});

		// Check if student has ANY completed past events to unlock the PDF download
		const completedCount = await locals.studentPb.collection('participations').getList(1, 1, {
			filter: `student = "${locals.student.id}" && is_present = true`,
			fields: 'id'
		});

		// If there are multiple events today, grab the first one
		const todayParticipation = participations.length > 0 ? participations[0] : null;

		return {
			student: locals.student,
			participation: todayParticipation,
			hasCompletedEvents: completedCount.totalItems > 0
		};
	} catch (err) {
		console.error('Error fetching camper dashboard data:', err);
		throw error(500, 'Erreur lors du chargement du dashboard');
	}
};
