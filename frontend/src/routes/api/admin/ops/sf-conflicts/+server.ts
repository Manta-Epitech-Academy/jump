import { adminApiRead } from '$lib/server/adminApi/route';

// Curated operation: see `$lib/server/adminApi/operations.ts` for the params,
// the description and what the figures mean. Auth, tier, validation and audit
// logging are handled by the wrapper.
export const GET = adminApiRead('ops_sf_conflicts_summary');
