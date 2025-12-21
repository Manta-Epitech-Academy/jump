import PocketBase from 'pocketbase';
import type { TypedPocketBase } from './pocketbase-types';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

// Fonction factory pour créer une nouvelle instance typée
export function createInstance(): TypedPocketBase {
	return new PocketBase(PUBLIC_POCKETBASE_URL) as TypedPocketBase;
}

// Export de l'URL pour référence ailleurs si besoin
export const pbUrl = PUBLIC_POCKETBASE_URL;
