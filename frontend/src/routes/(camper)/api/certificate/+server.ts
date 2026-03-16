import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateCertificatePDF } from '$lib/server/diplomaGenerator';
import { pbUrl } from '$lib/pocketbase';
import { formatDateFr } from '$lib/utils';
import type {
	ParticipationsResponse,
	SubjectsResponse,
	PortfolioItemsResponse
} from '$lib/pocketbase-types';

type ParticipationExpand = {
	subjects: SubjectsResponse[];
};

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.student) throw error(401, 'Non autorisé');

	try {
		// 1. Fetch completed events
		const participations = await locals.studentPb
			.collection('participations')
			.getFullList<ParticipationsResponse<ParticipationExpand>>({
				filter: `student = "${locals.student.id}" && is_present = true`,
				expand: 'subjects'
			});

		if (participations.length === 0) {
			throw error(400, 'Aucun événement complété.');
		}

		// 2. Gather Portfolio Images (Max 4 for the A4 PDF)
		const portfolio = await locals.studentPb
			.collection('portfolio_items')
			.getList<PortfolioItemsResponse>(1, 4, {
				filter: `student = "${locals.student.id}" && file != ""`,
				sort: '-created'
			});

		// 3. Deduplicate Subject names
		const subjectsSet = new Set<string>();
		participations.forEach((p) => {
			p.expand?.subjects?.forEach((s) => subjectsSet.add(s.nom));
		});

		// 4. Assemble Data
		const data = {
			studentName: `${locals.student.prenom} ${locals.student.nom}`,
			xp: locals.student.xp || 0,
			hours: participations.length * 3, // Assuming avg 3h per workshop/session
			level: locals.student.level || 'Novice',
			subjects: Array.from(subjectsSet),
			todayDate: formatDateFr(new Date()), // Replaced with project utility
			images: portfolio.items.map(
				(item) => `${pbUrl}/api/files/${item.collectionId}/${item.id}/${item.file}`
			)
		};

		// 5. Generate PDF Buffer via Puppeteer
		const pdfBytes = await generateCertificatePDF(data);

		// 6. Sanitize filename (matching existing api/diploma logic)
		const safeFirstName = locals.student.prenom.replace(/[^a-zA-Z0-9]/g, '');
		const safeLastName = locals.student.nom.replace(/[^a-zA-Z0-9]/g, '');

		// 7. Return as downloadable file wrapped in a Blob (matching existing pattern)
		return new Response(new Blob([pdfBytes], { type: 'application/pdf' }), {
			status: 200,
			headers: {
				'Content-Disposition': `attachment; filename="Attestation_${safeLastName}_${safeFirstName}.pdf"`
			}
		});
	} catch (err: unknown) {
		console.error('Erreur API Certificate :', err);
		// Catch SvelteKit errors and rethrow them so they don't get swallowed as 500s
		if (typeof err === 'object' && err !== null && 'status' in err) {
			throw err;
		}
		throw error(500, "Erreur lors de la génération de l'attestation.");
	}
};

