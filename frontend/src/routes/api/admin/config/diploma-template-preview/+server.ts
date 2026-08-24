import { adminApiImage } from '$lib/server/adminApi/route';

// Curated operation, served as the image itself rather than as JSON: see
// `$lib/server/adminApi/operations.ts` for the params. Auth, tier, validation
// and audit logging are handled by the wrapper, exactly as for a JSON read.
export const GET = adminApiImage('config_diploma_template_preview');
