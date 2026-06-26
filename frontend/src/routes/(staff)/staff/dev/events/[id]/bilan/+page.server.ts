import type { PageServerLoad } from './$types';
import { base } from '$app/paths';
import { env } from '$env/dynamic/private';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import {
  loadEventOr404,
  requireEventModule,
} from '$lib/server/services/stageContext';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { prisma } from '$lib/server/db';
import { computeFormStats, type FormStats } from '$lib/server/feedbackStats';
import { resolvePublishedEventForm } from '$lib/server/feedbackForms';
import { RECO_QUESTION_KEY, feedbackFormPath } from '$lib/domain/feedback';

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

export const load: PageServerLoad = async ({ params, locals }) => {
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(params.id, campusId);
  requireEventModule(event, EVENT_MODULES.BILAN);
  const db = scopedPrisma(campusId);

  // The form this event uses (its override, else the type default). Resolved the
  // same way as the QR/export (published + authenticated) so they never disagree:
  // a draft or archived form yields no bilan here either, instead of stats for a
  // form whose QR would 404. The full graph is loaded (not just id/title) so we
  // can read the recommendation question and its options. Dev never shows the
  // public link.
  const form = await resolvePublishedEventForm(event);

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

  // The shareable link shown next to the QR. Built from ORIGIN server-side (not
  // the page's own origin) so the copyable URL is byte-for-byte what the QR image
  // encodes, and stays correct behind a proxy. `feedbackFormPath` is the single
  // source the QR endpoint also uses, so the two never drift.
  const feedbackUrl = form
    ? `${env.ORIGIN ?? ''}${base}${feedbackFormPath(event.id, form.slug)}`
    : null;

  return {
    event: { id: event.id, titre: event.titre, publicName: event.publicName },
    form: form ? { title: form.title, url: feedbackUrl } : null,
    cohort,
  };
};
