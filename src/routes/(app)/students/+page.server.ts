import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { studentSchema } from '$lib/validation/students';
import type { ParticipationsResponse, ActivitiesResponse } from '$lib/pocketbase-types';

const LEVEL_XP: Record<string, number> = {
	'6eme': 10,
	'5eme': 15,
	'4eme': 20,
	'3eme': 25,
	'2nde': 35,
	'1ere': 45,
	Terminale: 55,
	Sup: 70
};

export const load: PageServerLoad = async ({ locals }) => {
	const students = await locals.pb.collection('students').getFullList({
		sort: 'nom,prenom'
	});

	const participations = await locals.pb.collection('participations').getFullList<
		ParticipationsResponse<{
			session: { expand: { activity: ActivitiesResponse } };
			activity?: ActivitiesResponse;
		}>
	>({
		filter: 'is_validated = true',
		expand: 'session.activity,activity'
	});

	const studentStats = new Map<string, { xp: number; sessionsCount: number }>();

	for (const p of participations) {
		const studentId = p.student;

		const specificActivity = p.expand?.activity;
		const sessionActivity = p.expand?.session?.expand?.activity;
		const effectiveActivity = specificActivity || sessionActivity;

		if (effectiveActivity && studentId) {
			const current = studentStats.get(studentId) || { xp: 0, sessionsCount: 0 };

			// If an activity targets multiple levels, we take the highest XP value
			const targetedNiveaux = (effectiveActivity.niveaux as string[]) || [];
			const xpGains = targetedNiveaux.map((lvl) => LEVEL_XP[lvl] || 10);
			const xpGain = xpGains.length > 0 ? Math.max(...xpGains) : 10;

			studentStats.set(studentId, {
				xp: current.xp + xpGain,
				sessionsCount: current.sessionsCount + 1
			});
		}
	}

	const studentsWithStats = students.map((s) => {
		const stats = studentStats.get(s.id) || { xp: 0, sessionsCount: 0 };
		return {
			...s,
			xp: stats.xp,
			sessionsCount: stats.sessionsCount
		};
	});

	const form = await superValidate(zod4(studentSchema));

	return {
		students: studentsWithStats,
		form
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await superValidate(request, zod4(studentSchema));
		if (!form.valid) return fail(400, { form });
		try {
			await locals.pb.collection('students').create(form.data);
			return message(form, 'Élève ajouté avec succès !');
		} catch (err) {
			return message(form, "Erreur lors de l'ajout", { status: 500 });
		}
	},

	update: async ({ request, locals }) => {
		const formData = await request.formData();
		const form = await superValidate(formData, zod4(studentSchema));
		const id = formData.get('id') as string;
		if (!form.valid || !id) return fail(400, { form });
		try {
			await locals.pb.collection('students').update(id, form.data);
			return message(form, 'Élève modifié avec succès !');
		} catch (err) {
			return message(form, 'Erreur lors de la modification', { status: 500 });
		}
	},

	delete: async ({ url, locals }) => {
		const id = url.searchParams.get('id');
		if (!id) return fail(400);
		try {
			await locals.pb.collection('students').delete(id);
			return { success: true };
		} catch (err) {
			return fail(500);
		}
	}
};
