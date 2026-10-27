import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { base } from '$app/paths';
import { env } from '$env/dynamic/private';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';
import {
  computeFormStats,
  loadCohortSubmissions,
  recoQuestionOf,
  type FormStats,
} from '$lib/server/feedbackStats';
import { resolvePublishedEventForm } from '$lib/server/feedbackForms';
import { feedbackFormPath } from '$lib/domain/feedback';

export interface BilanRow {
  talentId: string;
  nom: string | null;
  prenom: string | null;
  respondedAt: string | null;
  /** Label of the chosen recommendation option, null if not (yet) answered. */
  recoLabel: string | null;
}

interface BilanCohort {
  rows: BilanRow[];
  respondedCount: number;
  total: number;
  /** Recommendation options in canonical best→worst order (filter + badge tier). */
  recoOptions: string[];
  /** Aggregated answers; null when the form has no submissions yet. */
  stats: FormStats | null;
}

export const load: PageServerLoad = async ({ params, locals }) => {
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(params.id, campusId, EVENT_MODULES.BILAN);
  const db = scopedPrisma(campusId);

  // The form this event uses (its override, else the type default). Resolved the
  // same way as the QR/export (published + authenticated) so they never disagree:
  // a draft or archived form yields no bilan here either, instead of stats for a
  // form whose QR would 404. The full graph is loaded (not just id/title) so we
  // can read the recommendation question and its options. Dev never shows the
  // public link.
  const form = await resolvePublishedEventForm(event);
  if (!form) {
    // No resolvable live form: the bilan module is on but nothing answers it. The
    // nav entry hides on the same condition (`hasFeedbackForm`); a direct URL then
    // behaves like a missing page rather than dropping the dev on an empty shell.
    throw error(
      404,
      "Aucun formulaire de feedback n'est associé à cet événement.",
    );
  }

  const reco = recoQuestionOf(form);
  const recoLabelOf = new Map(reco?.options.map((o) => [o.id, o.label]));

  const cohort: Promise<BilanCohort> = (async () => {
    const [participations, byTalent, stats] = await Promise.all([
      // The roster the dev space shows, so `total` counts the same cohort as
      // the admin response rate's `invitedCount`, and the submissions and
      // figures beside it are that cohort's (`shownCohortOf`).
      db.participation.findMany({
        where: { eventId: event.id, ...visibleParticipationWhere },
        select: {
          talentId: true,
          talent: { select: { nom: true, prenom: true } },
        },
        orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
      }),
      loadCohortSubmissions(form.id, event.id, reco),
      computeFormStats(form.id, { shownCohortOf: event.id }),
    ]);

    const rows: BilanRow[] = participations.map((p) => {
      const sub = byTalent.get(p.talentId);
      return {
        talentId: p.talentId,
        nom: p.talent.nom,
        prenom: p.talent.prenom,
        respondedAt: sub ? sub.submittedAt.toISOString() : null,
        recoLabel: sub?.recoOptionId
          ? (recoLabelOf.get(sub.recoOptionId) ?? null)
          : null,
      };
    });

    return {
      rows,
      respondedCount: rows.filter((r) => r.respondedAt).length,
      total: rows.length,
      recoOptions: reco?.options.map((o) => o.label) ?? [],
      stats,
    };
  })();

  // The shareable link shown next to the QR. Built from ORIGIN server-side (not
  // the page's own origin) so the copyable URL is byte-for-byte what the QR image
  // encodes, and stays correct behind a proxy. `feedbackFormPath` is the single
  // source the QR endpoint also uses, so the two never drift.
  const feedbackUrl = `${env.ORIGIN ?? ''}${base}${feedbackFormPath(event.id, form.slug)}`;

  return {
    event: {
      id: event.id,
      titre: event.titre,
      publicName: event.publicName,
      cohortNoun: event.cohortNoun,
    },
    form: { title: form.title, url: feedbackUrl },
    cohort,
  };
};
