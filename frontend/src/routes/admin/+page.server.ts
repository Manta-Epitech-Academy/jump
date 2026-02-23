import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Retrieve global statistics
	// Use getList(1, 1) to retrieve totalItems efficiently without loading the actual records
	const [campuses, users, students, events] = await Promise.all([
		locals.pb.collection('campuses').getList(1, 1, { requestKey: null }),
		locals.pb.collection('users').getList(1, 1, { requestKey: null }),
		locals.pb.collection('students').getList(1, 1, { requestKey: null }),
		locals.pb.collection('events').getList(1, 5, {
			sort: '-created',
			expand: 'campus',
			requestKey: null
		})
	]);

	return {
		stats: {
			campuses: campuses.totalItems,
			users: users.totalItems,
			students: students.totalItems,
			events: events.totalItems
		},
		recentEvents: events.items.map((e) => ({
			id: e.id,
			titre: e.titre,
			date: new Date(e.date),
			campus: e.expand?.campus?.name || 'Inconnu'
		}))
	};
};
