import type { ScopedPrismaClient } from '$lib/server/db/scoped';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';

/** The two règlement signatures a dossier carries, for one talent. */
export type DossierSignatures = {
  rulesSignedAt: Date | null;
  parentRulesSignedAt: Date | null;
};

export type DossierSignatureMap = Map<string, DossierSignatures>;

/** What a talent with no dossier for the year in question shows as. */
export const NO_DOSSIER_SIGNATURES: DossierSignatures = {
  rulesSignedAt: null,
  parentRulesSignedAt: null,
};

/**
 * The règlement signatures of the event's cohort, read from the dossier of the
 * event's OWN school year rather than from the flat columns on `Talent`.
 *
 * Those columns are a projection of each talent's most recent dossier, so on a
 * past event they would report this year's state: a talent who signed for the
 * June event and re-onboarded in September would flip that June event's column
 * to unsigned, and one who signed only this year would show as compliant for an
 * event held before they ever signed anything. The question the column answers -
 * "has this student signed the règlement that applies to this event" - is about
 * the event's year, and this is where that year is applied.
 *
 * Loaded for the whole event cohort in one query, keyed by talent id, so the
 * page and the XLSX export can both look up whichever subset they are showing
 * without re-querying. Runs alongside the cohort fetch rather than after it: it
 * reaches the talents through the event, so it needs no list of ids.
 */
export async function loadEventDossierSignatures(
  db: ScopedPrismaClient,
  eventId: string,
  schoolYear: string,
): Promise<DossierSignatureMap> {
  const records = await db.onboarding_Record.findMany({
    where: {
      schoolYear,
      talent: {
        participations: { some: { eventId, ...visibleParticipationWhere } },
      },
    },
    select: {
      talentId: true,
      rulesSignedAt: true,
      parentRulesSignedAt: true,
    },
  });
  return new Map(
    records.map((r) => [
      r.talentId,
      {
        rulesSignedAt: r.rulesSignedAt,
        parentRulesSignedAt: r.parentRulesSignedAt,
      },
    ]),
  );
}
