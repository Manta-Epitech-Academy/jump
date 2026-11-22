import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';

// Legacy public path. The shareable feedback link moved to /f/[slug] (neutral,
// reads right for any form, not just a stage bilan). Kept as a permanent
// redirect so QR codes and links already in the wild keep working.
export const load: PageServerLoad = async ({ params }) => {
  throw redirect(301, resolve('/f/[slug]', { slug: params.slug }));
};
