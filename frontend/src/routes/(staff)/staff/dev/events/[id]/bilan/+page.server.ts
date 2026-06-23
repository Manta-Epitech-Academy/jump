import type { PageServerLoad } from './$types';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import { requireFlag } from '$lib/server/auth/guards';
import { prisma } from '$lib/server/db';
import { computeFormStats, type FormStats } from '$lib/server/feedbackStats';
import { getFormGraphBySlug } from '$lib/server/feedbackForms';
import { RECO_QUESTION_KEY, STAGE_FORM_SLUG } from '$lib/domain/feedback';

export interface BilanRow {
  talentId: string;
  nom: string | null;
  prenom: string | null;
  respondedAt: string | null;
  /** Label of the chosen recommendation option, null if not (yet) answered. */
  recoLabel: string | null;
}

export interface BilanCohort {
  rows: BilanRow[];
  respondedCount: number;
  total: number;
  /** Recommendation options in canonical best→worst order (filter + badge tier). */
  recoOptions: string[];
  stats: FormStats | null;
}

export const load: PageServerLoad = async ({ params, locals, depends }) => {
  depends('staff:event-bilan');

  const campusId = getCampusId(locals);
  requireFlag(locals, 'bilan');
  const event = await loadEventOr404(params.id, campusId);
  const db = scopedPrisma(campusId);

  // The bilan form is the canonical "stage" form; the page reports this event's
  // authenticated submissions against it. Resolved the same way as the QR/export
  // (published + authenticated) so they never disagree: a draft or archived form
  // yields no bilan here either, instead of stats for a form whose QR would 404.
  // The full graph is loaded (not just id/title) so we can read the recommendation
  // question and its options. The dev space never surfaces the public link.
  const graph = await getFormGraphBySlug(STAGE_FORM_SLUG);
  const form =
    graph && graph.status === 'published' && graph.allowsAuthenticatedAccess
      ? graph
      : null;

  const recoQ =
    form?.questions.find((q) => q.key === RECO_QUESTION_KEY) ?? null;
  const recoOptions = recoQ
    ? recoQ.options.filter((o) => o.kind === 'choice').map((o) => o.label)
    : [];

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
      (async () => {
        if (!form)
          return [] as {
            talentId: string | null;
            submittedAt: Date;
            recoLabel: string | null;
          }[];
        const subs = await prisma.feedback_Submission.findMany({
          where: {
            formId: form.id,
            eventId: event.id,
            source: 'authenticated',
          },
          select: {
            talentId: true,
            submittedAt: true,
            // Only the recommendation answer is pulled per talent for the roster
            // column; the empty-string id matches nothing when there is no reco
            // question, leaving every recoLabel null.
            answers: {
              where: { questionId: recoQ?.id ?? '' },
              select: {
                selectedOptions: {
                  select: { option: { select: { label: true } } },
                },
              },
            },
          },
        });
        return subs.map((s) => ({
          talentId: s.talentId,
          submittedAt: s.submittedAt,
          recoLabel: s.answers[0]?.selectedOptions[0]?.option.label ?? null,
        }));
      })(),
      form
        ? computeFormStats(form.id, { eventId: event.id })
        : Promise.resolve(null),
    ]);

    const byTalent = new Map(
      submissions
        .filter((s) => s.talentId)
        .map((s) => [s.talentId as string, s]),
    );

    const rows: BilanRow[] = participations.map((p) => {
      const sub = byTalent.get(p.talentId);
      return {
        talentId: p.talentId,
        nom: p.talent.nom,
        prenom: p.talent.prenom,
        respondedAt: sub ? sub.submittedAt.toISOString() : null,
        recoLabel: sub?.recoLabel ?? null,
      };
    });

    return {
      rows,
      respondedCount: rows.filter((r) => r.respondedAt).length,
      total: rows.length,
      recoOptions,
      stats,
    };
  })();

  return {
    event: { id: event.id, titre: event.titre },
    form: form ? { title: form.title } : null,
    cohort,
  };
};
