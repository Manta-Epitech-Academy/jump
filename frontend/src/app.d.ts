import type { TypedPocketBase, UsersResponse, SuperusersResponse } from '$lib/pocketbase-types';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			pb: TypedPocketBase;
			user: UsersResponse | SuperusersResponse | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
