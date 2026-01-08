import PocketBase from 'pocketbase';
import type { TypedPocketBase } from './pocketbase-types';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

export function createInstance(): TypedPocketBase {
	return new PocketBase(PUBLIC_POCKETBASE_URL) as TypedPocketBase;
}

export const pbUrl = PUBLIC_POCKETBASE_URL;
