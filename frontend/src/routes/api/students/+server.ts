import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const STUDENT_FIELDS = 'id,nom,prenom,niveau,niveau_difficulte,events_count,xp,level,badges';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	const query = url.searchParams.get('q') || '';
	const top = url.searchParams.has('top');

	// Default view: most active students (highest participation count)
	if (top) {
		const results = await locals.pb.collection('students').getList(1, 20, {
			sort: '-events_count,nom,prenom',
			fields: STUDENT_FIELDS
		});
		return json(results.items);
	}

	if (!query || query.length < 2) {
		return json([]);
	}

	const sanitized = query.replace(/[^a-zA-ZÀ-ÿ0-9\s'-]/g, '').trim();
	if (!sanitized) return json([]);

	const escaped = sanitized.replace(/"/g, '\\"');

	const results = await locals.pb.collection('students').getList(1, 20, {
		sort: 'nom,prenom',
		filter: `(nom ~ "${escaped}" || prenom ~ "${escaped}")`,
		fields: STUDENT_FIELDS,
		requestKey: null
	});

	return json(results.items);
};
