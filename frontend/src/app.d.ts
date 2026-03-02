import type { TypedPocketBase, UsersResponse, SuperusersResponse, StudentsResponse } from '$lib/pocketbase-types';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			pb: TypedPocketBase;
			adminPb: TypedPocketBase;
			staffPb: TypedPocketBase;
			studentPb: TypedPocketBase;
			systemPb: TypedPocketBase;
			user: UsersResponse | SuperusersResponse | null;
			student: StudentsResponse | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
