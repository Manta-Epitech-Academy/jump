import type { ScopedPrismaClient } from '$lib/server/db/scoped';
import type { ImageRightsDecision } from '$lib/domain/imageRights';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';

/**
 * The dossier state the inscrits table shows for one talent: the two règlement
 * signatures, and the guardian's image-rights decision for the same year.
 */
export type DossierSignatures = {
  rulesSignedAt: Date | null;
  parentRulesSignedAt: Date | null;
  imageRightsDecision: ImageRightsDecision | null;
};

export type DossierSignatureMap = Map<string, DossierSignatures>;

/** What a talent with no dossier for the year in question shows as. */
export const NO_DOSSIER_SIGNATURES: DossierSignatures = {
  rulesSignedAt: null,
  parentRulesSignedAt: null,
  imageRightsDecision: null,
};

/**
 * The dossier state of the event's cohort, read from the dossier of the event's
 * OWN school year rather than from the flat columns on `Talent`.
 *
 * Those columns are a projection of each talent's most recent dossier, so on a
 * past event they would report this year's state: a talent who signed for the
 * June event and re-onboarded in September would flip that June event's column
 * to unsigned, and one who signed only this year would show as compliant for an
 * event held before they ever signed anything. The question the columns answer -
 * "has this student's dossier for the year of THIS event been settled" - is about
 * the event's year, and this is where that year is applied.
 *
 * The image-rights decision travels with the signatures for exactly that reason,
 * and it did not use to: it was read off the projection while the règlement was
 * read off the dossier, so the two halves of one badge answered about two
 * different years the day the decision became annual.
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
      imageRightsDecision: true,
    },
  });
  return new Map(
    records.map((r) => [
      r.talentId,
      {
        rulesSignedAt: r.rulesSignedAt,
        parentRulesSignedAt: r.parentRulesSignedAt,
        imageRightsDecision: r.imageRightsDecision,
      },
    ]),
  );
}
