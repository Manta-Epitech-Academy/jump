import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { publicFormPath } from '$lib/domain/feedback';

// Legacy public path. The shareable feedback link moved to /f/[slug] (neutral,
// reads right for any form, not just a stage bilan). Kept as a permanent
// redirect so QR codes and links already in the wild keep working.
export const load: PageServerLoad = async ({ params }) => {
  throw redirect(301, `${base}${publicFormPath(params.slug)}`);
};
