import { serveOpenApiDocument } from '$lib/server/adminApi/openapi';

// The HTTP reference: every operation the caller's token can call, generated
// from the catalogue and the route files. Not an operation itself, see
// `$lib/server/adminApi/openapi.ts`.
export const GET = serveOpenApiDocument;
