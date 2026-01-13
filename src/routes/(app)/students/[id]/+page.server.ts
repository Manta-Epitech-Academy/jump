import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { studentSchema } from '$lib/validation/students';

export const load: PageServerLoad = async ({ locals, params }) => {
	try {
		const student = await locals.pb.collection('students').getOne(params.id);

		const participations = await locals.pb.collection('participations').getFullList({
			filter: `student = "${student.id}"`,
			sort: '-created',
			expand: 'event,subject,subject.themes'
		});

		const stats = {
			totalEvents: participations.length,
			presentCount: participations.filter((p) => p.is_present).length,
			validatedCount: participations.filter((p) => p.is_validated).length,
			favoriteTheme: 'Aucun'
		};

		const themeCounts: Record<string, number> = {};
		participations.forEach((p) => {
			if (p.is_validated && p.expand?.subject?.expand?.themes) {
				const themes = p.expand.subject.expand.themes;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				themes.forEach((t: any) => {
					themeCounts[t.nom] = (themeCounts[t.nom] || 0) + 1;
				});
			}
		});

		const sortedThemes = Object.entries(themeCounts).sort((a, b) => b[1] - a[1]);
		if (sortedThemes.length > 0) {
			stats.favoriteTheme = sortedThemes[0][0];
		}

		const form = await superValidate(student, zod4(studentSchema));

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
			await locals.pb.collection('students').update(params.id, form.data);
			return message(form, 'Profil mis à jour avec succès !');
		} catch (err) {
			return message(form, 'Erreur lors de la mise à jour', { status: 500 });
		}
	}
};
