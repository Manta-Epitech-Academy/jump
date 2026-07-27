import { adminApiRoute } from '$lib/server/adminApi/route';

// Curated operation: see `$lib/server/adminApi/operations.ts` for the params,
// the French description and what the figures mean. Auth (bearer token or admin
// session), validation and audit logging are handled by the wrapper.
export const GET = adminApiRoute('stats_events_overview');
