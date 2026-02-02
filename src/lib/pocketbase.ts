import PocketBase from 'pocketbase';
import type { TypedPocketBase, CollectionRecords, Create } from './pocketbase-types';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

export function createInstance(): TypedPocketBase {
	return new PocketBase(PUBLIC_POCKETBASE_URL) as TypedPocketBase;
}

export const pbUrl = PUBLIC_POCKETBASE_URL;

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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const payload: any = {
		...data,
		campus: user.campus
	};

	// 3. Perform Create
	return await pb.collection(collection).create(payload);
}
