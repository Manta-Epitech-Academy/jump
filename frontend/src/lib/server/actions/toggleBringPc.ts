import { fail } from '@sveltejs/kit';
import type PocketBase from 'pocketbase';

export async function toggleBringPc(formData: FormData, pb: PocketBase) {
	const id = formData.get('id') as string;
	const currentState = formData.get('state') === 'true';

	try {
		await pb.collection('participations').update(id, {
			bring_pc: !currentState,
		});
		return { success: true };
	} catch (err) {
		console.error('Error toggling bring_pc:', err);
		return fail(500, { error: 'Erreur mise à jour PC' });
	}
}
