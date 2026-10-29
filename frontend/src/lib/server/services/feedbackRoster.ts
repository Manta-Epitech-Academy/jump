import type { ScopedPrismaClient } from '$lib/server/db/scoped';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';
import {
  loadCohortSubmissions,
  type RecoQuestion,
} from '$lib/server/feedbackStats';

/** One enrolment the dev space shows, with its feedback answer if any. */
export type FeedbackRosterRow = {
  talentId: string;
  nom: string;
  prenom: string;
  /** When the talent answered, null while they have not. */
  respondedAt: Date | null;
  /** The recommendation option picked, null when there is none: not answered
   *  (yet), or an `extra` option, which is no verdict (`recoQuestionOf`). */
  recoOptionId: string | null;
};

/** The roster with the two figures every reading of it starts from.
 *  `total` is the number of enrolments, the response rate's denominator. */
export type FeedbackRoster = {
  rows: FeedbackRosterRow[];
  respondedCount: number;
  total: number;
};

/**
 * An event's feedback roster, as the Feedback page lists it and the event home
 * counts it: the roster the dev space shows, so `total` counts the same cohort
 * as the admin response rate's `invitedCount`, and the submissions beside it
 * are that cohort's (`shownCohortOf`, inside `loadCohortSubmissions`).
 */
export async function loadFeedbackRoster(
  db: ScopedPrismaClient,
  eventId: string,
  formId: string,
  reco: RecoQuestion | null,
): Promise<FeedbackRoster> {
  const [participations, byTalent] = await Promise.all([
    db.participation.findMany({
      where: { eventId, ...visibleParticipationWhere },
      select: {
        talentId: true,
        talent: { select: { nom: true, prenom: true } },
      },
      orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
    }),
    loadCohortSubmissions(formId, eventId, reco),
  ]);

  const rows: FeedbackRosterRow[] = participations.map((p) => {
    const sub = byTalent.get(p.talentId);
    return {
      talentId: p.talentId,
      nom: p.talent.nom,
      prenom: p.talent.prenom,
      respondedAt: sub?.submittedAt ?? null,
      recoOptionId: sub?.recoOptionId ?? null,
    };
  });

  return {
    rows,
    respondedCount: rows.filter((r) => r.respondedAt).length,
    total: rows.length,
  };
}
