import { adminApiWrite } from '$lib/server/adminApi/route';

// Curated operation: see `$lib/server/adminApi/operations.ts` for the params,
// the description and what it changes. Auth, tier, validation and audit logging
// are handled by the wrapper.
export const POST = adminApiWrite('write_event_closing_template');
