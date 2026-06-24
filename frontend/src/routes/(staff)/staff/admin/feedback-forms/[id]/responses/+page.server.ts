import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { requireAdmin } from '$lib/server/feedbackFormsAdmin';
import {
  computeFormStats,
  getPublicRespondents,
} from '$lib/server/feedbackStats';

// Per-form aggregate reporting, co-located with the form it belongs to. Covers
// EVERY submission of the form (authenticated + public, all events), so it is
// the home of the public / non-onboarded-campus responses too. An optional
// campus filter spans both channels (event campus + self-reported label).
export const load: PageServerLoad = async ({ params, locals, url }) => {
  requireAdmin(locals);

  const form = await prisma.feedback_Form.findUnique({
    where: { id: params.id },
    select: { id: true, slug: true, title: true, allowsPublicAccess: true },
  });
  if (!form) throw error(404, 'Formulaire introuvable');

  const campusName = url.searchParams.get('campus') || undefined;

  // Cheap shell: the campus filter chips. Awaited so the page chrome paints at once.
  const campuses = await prisma.campus.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  // Heavy aggregation (groupBys + the free-text scan over every submission of the
  // form, across all events/campuses) is streamed, not awaited: per the staff
  // streaming rule, cohort-scale work must not block the load. The page resolves
  // this behind a ResultsSkeleton.
  const results = Promise.all([
    computeFormStats(form.id, { campusName }),
    getPublicRespondents(form.id, { campusName }),
  ]).then(([stats, publicRespondents]) => {
    // The form's existence is already enforced above; computeFormStats only
    // returns null if its graph vanished mid-request (deleted concurrently), so
    // surface that as a 404 rather than thread a nullable stats through the page.
    if (!stats) throw error(404, 'Formulaire introuvable');
    return { stats, publicRespondents };
  });

  return {
    form,
    campuses,
    selectedCampus: campusName ?? 'all',
    results,
  };
};
