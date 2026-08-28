import type { PageServerLoad, Actions } from './$types';
import type { Prisma, ClosingRecommendation } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { resetClosing } from '$lib/server/services/closingResetService';
import { CLOSING_RECOMMENDATIONS } from '$lib/domain/closing';
import { fail } from '@sveltejs/kit';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

const RESET_REASON_MAX = 500;

// The reco filter feeds a Prisma enum query, which throws on an unknown value.
// Validate against the catalogue's keys so a hand-edited `?reco=` degrades to
// "all" rather than 500-ing the page.
const VALID_RECOS = new Set<string>(Object.keys(CLOSING_RECOMMENDATIONS));

export const load: PageServerLoad = async ({ url, locals, depends }) => {
  depends('admin:closing-pdfs');

  const recoParam = url.searchParams.get('reco') ?? 'all';
  const statusFilter = VALID_RECOS.has(recoParam) ? recoParam : 'all';
  const q = url.searchParams.get('q') ?? '';

  const where: Prisma.Closing_RecordWhereInput = { status: 'done' };

  if (statusFilter !== 'all') {
    // Validated against the catalogue keys above, so the cast is safe.
    where.recommendation = statusFilter as ClosingRecommendation;
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

  // Stream the cohort: the heading and export menu paint immediately while the
  // row page, the total match count and the per-recommendation KPI counts (the
  // blocking query cost) resolve behind the shell skeleton. Mirrors the talents
  // / sf-conflicts admin tables. The export timeline used to ride this load too,
  // but it's an unbounded scan only the export popover needs, so it moved to
  // ./export-timeline and the menu fetches it lazily on open.
  const cohort = (async () => {
    const [closings, matchCount, recoCounts] = await Promise.all([
      prisma.closing_Record.findMany({
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
      prisma.closing_Record.count({ where }),
      prisma.closing_Record.groupBy({
        by: ['recommendation'],
        where: { status: 'done' },
        _count: true,
      }),
    ]);

    const recoMap: Record<string, number> = {};
    for (const r of recoCounts) {
      if (r.recommendation) recoMap[r.recommendation] = r._count;
    }
    const totalDone = recoCounts.reduce((s, r) => s + r._count, 0);

    return {
      closings: closings.map((c) => ({
        id: c.id,
        conductedAt: c.conductedAt.toISOString(),
        recommendation: c.recommendation,
        talentName: `${c.talent.prenom} ${c.talent.nom}`,
        staffName: c.staff.user.name ?? 'Staff',
        campusName: c.campus.name,
        eventTitle: c.participation.event.titre,
      })),
      matchCount,
      truncated: matchCount > PAGE_SIZE,
      totalDone,
      recoCounts: recoMap,
    };
  })();

  return {
    filters: { reco: statusFilter, q },
    // Un-awaited on purpose: SvelteKit streams it so the chrome paints first.
    cohort,
    lastExportAt:
      locals.staffProfile?.closingDocsExportedAt?.toISOString() ?? null,
  };
};

export const actions: Actions = {
  // Reset = hard-delete a closing finalised by mistake, returning the talent
  // to "à faire" so a fresh one can be conducted. Belt-and-braces admin assert
  // on top of the /staff/admin/* route guard, since this destroys a colleague's
  // finalised work on a minor's record. Mirrors the account-deletions guard.
  reset: async ({ request, locals }) => {
    recordUsage(USAGE_FEATURES.ADMIN_CLOSING_RESET, { locals });
    if (locals.staffProfile?.staffRole !== 'admin') {
      return fail(403, { error: 'Réservé aux administrateurs.' });
    }

    const form = await request.formData();
    const id = form.get('id');
    const reason = form.get('reason');

    if (typeof id !== 'string' || !id) {
      return fail(400, { error: 'Closing manquant.' });
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
      const done = await resetClosing({
        closingId: id,
        resetByStaffId: locals.staffProfile.id,
        reason: trimmedReason,
      });
      if (!done) {
        return fail(409, { error: 'Closing déjà réinitialisé.' });
      }
    } catch (err) {
      console.error('[closing-pdfs] reset failed', err);
      return fail(500, { error: 'Échec de la réinitialisation.' });
    }

    return { success: true };
  },
};
