import type { PageServerLoad } from './$types';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import { requireFlag } from '$lib/server/auth/guards';
import { prisma } from '$lib/server/db';
import { computeFormStats, type FormStats } from '$lib/server/feedbackStats';
import { STAGE_FORM_SLUG } from '$lib/domain/feedback';

export interface BilanRow {
  talentId: string;
  nom: string | null;
  prenom: string | null;
  respondedAt: string | null;
}

export interface BilanCohort {
  rows: BilanRow[];
  respondedCount: number;
  total: number;
  stats: FormStats | null;
}

export const load: PageServerLoad = async ({ params, locals, depends }) => {
  depends('staff:event-bilan');

  const campusId = getCampusId(locals);
  requireFlag(locals, 'bilan');
  const event = await loadEventOr404(params.id, campusId);
  const db = scopedPrisma(campusId);

  // The bilan form is the canonical "stage" form; the page reports this event's
  // authenticated submissions against it. Resolved the same way as the QR
  // (published + authenticated) so the two never disagree: a draft or archived
  // form yields no bilan here either, instead of showing stats for a form whose
  // QR would 404. The dev space never surfaces the public link.
  const form = await prisma.feedback_Form.findFirst({
    where: {
      slug: STAGE_FORM_SLUG,
      status: 'published',
      allowsAuthenticatedAccess: true,
    },
    select: { id: true, title: true },
  });

  const cohort: Promise<BilanCohort> = (async () => {
    const [participations, submissions, stats] = await Promise.all([
      db.participation.findMany({
        where: { eventId: event.id },
        select: {
          talentId: true,
          talent: { select: { nom: true, prenom: true } },
        },
        orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
      }),
      form
        ? prisma.feedback_Submission.findMany({
            where: {
              formId: form.id,
              eventId: event.id,
              source: 'authenticated',
            },
            select: { talentId: true, submittedAt: true },
          })
        : Promise.resolve([]),
      form
        ? computeFormStats(form.id, { eventId: event.id })
        : Promise.resolve(null),
    ]);

    const respondedAt = new Map(
      submissions
        .filter((s) => s.talentId)
        .map((s) => [s.talentId as string, s.submittedAt.toISOString()]),
    );

    const rows: BilanRow[] = participations.map((p) => ({
      talentId: p.talentId,
      nom: p.talent.nom,
      prenom: p.talent.prenom,
      respondedAt: respondedAt.get(p.talentId) ?? null,
    }));

    return {
      rows,
      respondedCount: rows.filter((r) => r.respondedAt).length,
      total: rows.length,
      stats,
    };
  })();

  return {
    event: { id: event.id, titre: event.titre },
    form: form ? { title: form.title } : null,
    cohort,
  };
};
