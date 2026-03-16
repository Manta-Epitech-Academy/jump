import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	try {
		// We use `systemPb` to bypass client authentication rules for this public endpoint.
		// We explicitly filter down the returned fields to ensure absolutely NO PII is leaked.
		const student = await locals.systemPb.collection('students').getOne(params.id, {
			fields: 'id,prenom,nom,niveau,xp,level,badges,events_count'
		});

		const portfolioItems = await locals.systemPb.collection('portfolio_items').getFullList({
			filter: `student = "${student.id}"`,
			fields: 'id,collectionId,file,url,caption,expand.event.titre',
			sort: '-created',
			expand: 'event'
		});

		return {
			student: {
				id: student.id,
				prenom: student.prenom,
				nomInitial: student.nom ? `${student.nom.charAt(0).toUpperCase()}.` : '',
				niveau: student.niveau,
				xp: student.xp,
				level: student.level,
				badges: student.badges,
				events_count: student.events_count
			},
			portfolioItems: portfolioItems.map((item) => ({
				id: item.id,
				collectionId: item.collectionId,
				file: item.file,
				url: item.url,
				caption: item.caption,
				eventName: item.expand?.event?.titre || 'TekCamp'
			}))
		};
	} catch (err) {
		console.error('Public showcase fetch error:', err);
		throw error(404, 'Profil introuvable');
	}
};
