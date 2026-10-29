import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { base } from '$app/paths';
import { env } from '$env/dynamic/private';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import {
  computeFormStats,
  recoQuestionOf,
  type FormStats,
} from '$lib/server/feedbackStats';
import { loadFeedbackRoster } from '$lib/server/services/feedbackRoster';
import { countShownCohort } from '$lib/server/services/inscritsCohort';
import { resolvePublishedEventForm } from '$lib/server/feedbackForms';
import { feedbackFormPath } from '$lib/domain/feedback';
import type { BilanRow, RecoOption } from '$lib/domain/bilanRoster';

interface BilanCohort {
  rows: BilanRow[];
  respondedCount: number;
  total: number;
  /** Recommendation options in canonical best→worst order (filter + badge tier). */
  recoOptions: RecoOption[];
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
  const [form, rosterSize] = await Promise.all([
    resolvePublishedEventForm(event),
    countShownCohort(db, event.id),
  ]);
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

  const cohort: Promise<BilanCohort> = (async () => {
    const [roster, stats] = await Promise.all([
      loadFeedbackRoster(db, event.id, form.id, reco),
      computeFormStats(form.id, { shownCohortOf: event.id }),
    ]);

    const rows: BilanRow[] = roster.rows.map((r) => ({
      talentId: r.talentId,
      nom: r.nom,
      prenom: r.prenom,
      respondedAt: r.respondedAt?.toISOString() ?? null,
      recoOptionId: r.recoOptionId,
    }));

    return {
      rows,
      respondedCount: roster.respondedCount,
      total: roster.total,
      recoOptions:
        reco?.options.map((o) => ({ id: o.id, label: o.label })) ?? [],
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
    // The header offers its export only when someone is there to export.
    rosterSize,
    cohort,
  };
};
