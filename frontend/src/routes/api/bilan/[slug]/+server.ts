import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';

// Legacy public submit endpoint. Moved to /api/f/[slug] alongside the /f/[slug]
// page. 308 preserves the POST method + body for any client still hitting the
// old path.
export const POST: RequestHandler = async ({ params }) => {
  throw redirect(308, resolve('/api/f/[slug]', { slug: params.slug }));
};
