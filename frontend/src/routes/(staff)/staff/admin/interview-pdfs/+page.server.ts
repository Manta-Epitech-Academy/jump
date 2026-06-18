import type { PageServerLoad, Actions } from './$types';
import { prisma } from '$lib/server/db';
import { interviewPdfSelect } from '$lib/server/services/interviewPdfGenerator';
import { resetInterview } from '$lib/server/services/interviewResetService';
import { fail } from '@sveltejs/kit';

const RESET_REASON_MAX = 500;

export const load: PageServerLoad = async ({ url, locals, depends }) => {
  depends('admin:interview-pdfs');

  const statusFilter = url.searchParams.get('reco') ?? 'all';
  const q = url.searchParams.get('q') ?? '';

  const where: Record<string, unknown> = { status: 'done' };

  if (statusFilter !== 'all') {
    where.recommendation = statusFilter;
  }

  if (q) {
    where.talent = {
      OR: [
        { prenom: { contains: q, mode: 'insensitive' } },
        { nom: { contains: q, mode: 'insensitive' } },
      ],
    };
  }

  const PAGE_SIZE = 100;

  const [interviews, matchCount, recoCounts] = await Promise.all([
    prisma.interview.findMany({
      where,
      select: {
        id: true,
        conductedAt: true,
        recommendation: true,
        talent: { select: { prenom: true, nom: true } },
        staff: { select: { user: { select: { name: true } } } },
        campus: { select: { name: true } },
        participation: { select: { event: { select: { titre: true } } } },
      },
      orderBy: { conductedAt: 'desc' },
      take: PAGE_SIZE,
    }),
    prisma.interview.count({ where }),
    prisma.interview.groupBy({
      by: ['recommendation'],
      where: { status: 'done' },
      _count: true,
    }),
  ]);

  // Build timeline for ExportMenu (conductedAt of all done interviews)
  const timeline = await prisma.interview.findMany({
    where: { status: 'done' },
    select: { conductedAt: true },
    orderBy: { conductedAt: 'desc' },
  });

  const recoMap: Record<string, number> = {};
  for (const r of recoCounts) {
    if (r.recommendation) recoMap[r.recommendation] = r._count;
  }
  const totalDone = recoCounts.reduce((s, r) => s + r._count, 0);

  return {
    filters: { reco: statusFilter, q },
    interviews: interviews.map((i) => ({
      id: i.id,
      conductedAt: i.conductedAt.toISOString(),
      recommendation: i.recommendation,
      talentName: `${i.talent.prenom} ${i.talent.nom}`,
      staffName: i.staff.user.name ?? 'Staff',
      campusName: i.campus.name,
      eventTitle: i.participation.event.titre,
    })),
    matchCount,
    truncated: matchCount > PAGE_SIZE,
    totalDone,
    recoCounts: recoMap,
    exportTimeline: timeline.map((t) => t.conductedAt.toISOString()),
    lastExportAt:
      locals.staffProfile?.interviewDocsExportedAt?.toISOString() ?? null,
  };
};

export const actions: Actions = {
  // Reset = hard-delete an interview finalized by mistake, returning the talent
  // to "à faire" so a fresh one can be conducted. Belt-and-braces admin assert
  // on top of the /staff/admin/* route guard, since this destroys a colleague's
  // finalized work on a minor's record. Mirrors the account-deletions guard.
  reset: async ({ request, locals }) => {
    if (locals.staffProfile?.staffRole !== 'admin') {
      return fail(403, { error: 'Réservé aux administrateurs.' });
    }

    const form = await request.formData();
    const id = form.get('id');
    const reason = form.get('reason');

    if (typeof id !== 'string' || !id) {
      return fail(400, { error: 'Entretien manquant.' });
    }
    const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
    if (!trimmedReason) {
      return fail(400, { error: 'Motif de la réinitialisation requis.' });
    }
    if (trimmedReason.length > RESET_REASON_MAX) {
      return fail(400, {
        error: `Le motif ne peut pas dépasser ${RESET_REASON_MAX} caractères.`,
      });
    }

    try {
      const done = await resetInterview({
        interviewId: id,
        resetByStaffId: locals.staffProfile.id,
        reason: trimmedReason,
      });
      if (!done) {
        return fail(409, { error: 'Entretien déjà réinitialisé.' });
      }
    } catch (err) {
      console.error('[interview-pdfs] reset failed', err);
      return fail(500, { error: 'Échec de la réinitialisation.' });
    }

    return { success: true };
  },
};
