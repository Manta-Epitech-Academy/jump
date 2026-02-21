import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { studentSchema } from '$lib/validation/students';
import type {
	ParticipationsResponse,
	EventsResponse,
	SubjectsResponse,
	ThemesResponse,
	StudentsNiveauDifficulteOptions
} from '$lib/pocketbase-types';

type SubjectExpand = {
	themes?: ThemesResponse[];
};

type ParticipationExpand = {
	event?: EventsResponse;
	subjects?: SubjectsResponse<SubjectExpand>[];
};

export const load: PageServerLoad = async ({ locals, params }) => {
	try {
		const student = await locals.pb.collection('students').getOne(params.id);

		const participations = await locals.pb
			.collection('participations')
			.getFullList<ParticipationsResponse<ParticipationExpand>>({
				filter: `student = "${student.id}"`,
				sort: '-event.date',
				expand: 'event,subjects,subjects.themes'
			});

		const stats = {
			totalEvents: participations.length,
			presentCount: participations.filter((p) => p.is_present).length,
			lateCount: participations.filter((p) => p.is_present && (p.delay || 0) > 0).length,
			favoriteTheme: 'Aucun'
		};

		const themeCounts: Record<string, number> = {};
		participations.forEach((p) => {
			if (p.is_present && p.expand?.subjects) {
				p.expand.subjects.forEach((subject) => {
					if (subject.expand?.themes) {
						subject.expand.themes.forEach((t) => {
							themeCounts[t.nom] = (themeCounts[t.nom] || 0) + 1;
						});
					}
				});
			}
		});

		const sortedThemes = Object.entries(themeCounts).sort((a, b) => b[1] - a[1]);
		if (sortedThemes.length > 0) {
			stats.favoriteTheme = sortedThemes[0][0];
		}

		const form = await superValidate(student, zod4(studentSchema));
		if (!student.niveau_difficulte) form.data.niveau_difficulte = 'Débutant';

		return {
			student,
			participations,
			stats,
			form
		};
	} catch (e) {
		console.error('Erreur chargement élève:', e);
		throw error(404, 'Élève introuvable');
	}
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const form = await superValidate(request, zod4(studentSchema));
		if (!form.valid) return fail(400, { form });

		try {
			await locals.pb.collection('students').update(params.id, {
				...form.data,
				niveau_difficulte: form.data.niveau_difficulte as StudentsNiveauDifficulteOptions
			});
			return message(form, 'Profil mis à jour avec succès !');
		} catch (err) {
			return message(form, 'Erreur lors de la mise à jour', { status: 500 });
		}
	},

	delete: async ({ params, locals }) => {
		try {
			await locals.pb.collection('students').delete(params.id);
		} catch (err) {
			console.error('Error deleting student:', err);
			return fail(500, { message: 'Impossible de supprimer cet élève' });
		}
		throw redirect(303, resolve('/students'));
	}
};
