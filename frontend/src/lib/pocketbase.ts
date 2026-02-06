import PocketBase from 'pocketbase';
import type { TypedPocketBase, CollectionRecords, Create } from './pocketbase-types';
import { env } from '$env/dynamic/public';

export function createInstance(): TypedPocketBase {
	let url = env.PUBLIC_POCKETBASE_URL;

	// Check if we are running on the server (SSR)
	if (typeof window === 'undefined') {
		// If the internal Docker URL exists, use it.
		// Since we renamed it to PUBLIC_INTERNAL_..., we can access it here safely via 'env'
		if (env.PUBLIC_INTERNAL_POCKETBASE_URL) {
			url = env.PUBLIC_INTERNAL_POCKETBASE_URL;
		}
	}

	return new PocketBase(url) as TypedPocketBase;
}

// Export the URL for use in avatars and links (always public for the browser)
export const pbUrl = env.PUBLIC_POCKETBASE_URL;

/**
 * Creates a record automatically scoped to the user's campus.
 * Use this for creating Students, Events, Participations, etc.
 *
 * @param pb The PocketBase instance (from locals)
 * @param collection The collection name
 * @param data The form data to create
 * @returns The created record
 */
export async function createScoped<T extends keyof CollectionRecords>(
	pb: TypedPocketBase,
	collection: T,
	data: Omit<Create<T>, 'campus'>
) {
	// 1. Get current user model
	const user = pb.authStore.record;

	if (!user || !user.campus) {
		throw new Error(
			"Impossible de créer des données : Aucun campus associé à l'utilisateur connecté."
		);
	}

	// 2. Inject campus ID
	const payload: any = {
		...data,
		campus: user.campus
	};

	// 3. Perform Create
	return await pb.collection(collection).create(payload, { requestKey: null });
}
