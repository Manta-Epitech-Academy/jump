import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { resolve } from '$app/paths';

export const actions: Actions = {
	default: async ({ locals }) => {
		// Vérifier qui est en train de se déconnecter avant de vider le store
		const isSuperuser = locals.user?.collectionName === '_superusers';

		// Clear the PocketBase auth store
		locals.pb.authStore.clear();
		locals.user = null;

		// Rediriger vers le login correspondant
		const redirectPath = isSuperuser ? '/admin/login' : '/login';
		throw redirect(302, resolve(redirectPath));
	}
};
