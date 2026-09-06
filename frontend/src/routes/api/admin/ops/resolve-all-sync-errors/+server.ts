import { adminApiWrite } from '$lib/server/adminApi/route';

// Curated write: see `$lib/server/adminApi/operations.ts` for the params and
// whether repeating it is safe. Auth, tier, write capability, quota, audit
// (with before/after) and the two-step contract are handled by the wrapper.
export const POST = adminApiWrite('ops_resolve_all_sync_errors');
