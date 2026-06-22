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

  const [stats, publicRespondents, campuses] = await Promise.all([
    computeFormStats(form.id, { campusName }),
    getPublicRespondents(form.id, { campusName }),
    prisma.campus.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return {
    form,
    stats,
    publicRespondents,
    campuses,
    selectedCampus: campusName ?? 'all',
  };
};
