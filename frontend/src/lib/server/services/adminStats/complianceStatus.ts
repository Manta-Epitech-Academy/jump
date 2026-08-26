/**
 * Who is legally in order, and who is not.
 *
 * Three separate obligations, deliberately kept apart because they are three
 * different documents that people routinely conflate:
 *
 *   - the **Charte Informatique et Éthique** (RGPD), which the talent accepts
 *     to use Jump;
 *   - the **règlement intérieur**, signed by the talent and, for a minor,
 *     co-signed by their legal guardian, which is what makes the two signatures
 *     two figures rather than one;
 *   - the **droit à l'image**, a guardian's ternary decision where a refusal is
 *     a settled answer, not a missing one.
 *
 * That last distinction is the reason this operation exists rather than a single
 * "conformité" percentage: "refusé" and "en attente" mean opposite things
 * operationally (one is done, one needs chasing) and legally (one forbids using
 * a photo, the other has decided nothing yet). Any figure that merged them would
 * be quoted as if it were a completion rate.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { IMAGE_RIGHTS_STATUS_LABELS } from '$lib/domain/imageRights';
import { metric, share, type Metric } from '$lib/server/adminApi/metrics';
import type { Scope } from '$lib/server/adminApi/scope';
import { cohortWhere, dossierSchoolYear, scopeLabels } from './cohort';

export type ImageRightsRow = {
  status: string;
  label: string;
  count: number;
  share: number | null;
};

export type ComplianceStatus = {
  filters: { schoolYear: string; campus: string; event: string };
  cohort: Metric;
  charterAccepted: Metric;
  charterAcceptedShare: Metric<number | null>;
  rulesSignedByTalent: Metric;
  rulesSignedByTalentShare: Metric<number | null>;
  rulesCosignedByGuardian: Metric;
  rulesCosignedShare: Metric<number | null>;
  rulesAwaitingGuardian: Metric;
  rulesAwaitingGuardianShare: Metric<number | null>;
  imageRights: Metric<ImageRightsRow[]>;
  usableInCommunication: Metric<number | null>;
};

export async function getComplianceStatus(
  scope: Scope = {},
): Promise<ComplianceStatus> {
  const where = await cohortWhere(scope);
  const and = (extra: object) => ({ where: { AND: [where, extra] } });
  // The règlement is signed and the image right decided once per school year, so
  // a scoped question is about that year's dossier row - the flat columns are the
  // most recent dossier and would change last year's answer the day a talent
  // re-onboards. Unscoped, the cohort spans years and the projection is the right
  // reading. Same rule as the funnel, see `dossierSchoolYear`.
  const schoolYear = dossierSchoolYear(scope);
  const onDossierThatYear = (criteria: Prisma.Onboarding_RecordWhereInput) =>
    schoolYear
      ? { onboardingRecords: { some: { schoolYear, ...criteria } } }
      : criteria;
  const signedThatYear = (field: 'rulesSignedAt' | 'parentRulesSignedAt') =>
    onDossierThatYear({ [field]: { not: null } });

  const [cohort, charter, rulesTalent, rulesGuardian, accepted, refused] =
    await Promise.all([
      prisma.talent.count({ where }),
      prisma.talent.count(and({ charterAcceptedAt: { not: null } })),
      prisma.talent.count(and(signedThatYear('rulesSignedAt'))),
      prisma.talent.count(and(signedThatYear('parentRulesSignedAt'))),
      prisma.talent.count(
        and(onDossierThatYear({ imageRightsDecision: 'accepted' })),
      ),
      prisma.talent.count(
        and(onDossierThatYear({ imageRightsDecision: 'refused' })),
      ),
    ]);

  const undecided = cohort - accepted - refused;
  const imageRow = (
    status: keyof typeof IMAGE_RIGHTS_STATUS_LABELS,
    count: number,
  ): ImageRightsRow => ({
    status,
    label: IMAGE_RIGHTS_STATUS_LABELS[status],
    count,
    share: share(count, cohort),
  });

  return {
    filters: scopeLabels(scope),
    cohort: metric(
      cohort,
      'Talents du périmètre. Sert de dénominateur à tous les pourcentages ci-dessous.',
    ),
    charterAccepted: metric(
      charter,
      "Talents ayant accepté la Charte Informatique et Éthique. C'est le document RGPD encadrant le traitement de leurs données personnelles, qui conditionne l'usage de Jump, distinct du règlement intérieur.",
    ),
    charterAcceptedShare: metric(
      share(charter, cohort),
      'Part du périmètre ayant accepté la Charte Informatique et Éthique, en pourcentage.',
    ),
    rulesSignedByTalent: metric(
      rulesTalent,
      'Talents ayant signé le règlement intérieur eux-mêmes, en ligne, pendant leur inscription. Le règlement se signe une fois par année scolaire : filtré sur une année, ce chiffre compte la signature de cette année-là.',
    ),
    rulesSignedByTalentShare: metric(
      share(rulesTalent, cohort),
      'Part du périmètre ayant signé le règlement intérieur, en pourcentage.',
    ),
    rulesCosignedByGuardian: metric(
      rulesGuardian,
      "Talents dont le responsable légal a contresigné le règlement intérieur. Pour un mineur, c'est cette contresignature qui rend le document complet.",
    ),
    rulesCosignedShare: metric(
      share(rulesGuardian, cohort),
      'Part du périmètre dont le règlement intérieur est contresigné par le responsable légal, en pourcentage : la part de dossiers réellement complets sur ce point.',
    ),
    rulesAwaitingGuardian: metric(
      Math.max(rulesTalent - rulesGuardian, 0),
      "Talents qui ont signé le règlement mais dont le responsable légal ne l'a pas encore contresigné : ceux qu'il reste à relancer, côté parent.",
    ),
    rulesAwaitingGuardianShare: metric(
      share(Math.max(rulesTalent - rulesGuardian, 0), rulesTalent),
      "Part des talents ayant signé qui attendent encore la contresignature de leur responsable légal, en pourcentage. Rapportée aux signatures et non à la cohorte : c'est la mesure de ce que la relance parentale a encore à traiter.",
    ),
    imageRights: metric(
      [
        imageRow('accepted', accepted),
        imageRow('refused', refused),
        imageRow('undecided', undecided),
      ],
      "Décision du responsable légal sur le droit à l'image pour l'année scolaire concernée, en trois états. La décision est redemandée à chaque année scolaire, donc « En attente » signifie que personne n'a répondu pour cette année-là, pas que personne n'a jamais répondu. « Refusé » est une réponse arrêtée, pas une signature manquante : cet élève ne doit pas être photographié, et un refus donné une année continue de s'appliquer tant qu'aucune décision nouvelle ne l'a remplacé.",
    ),
    usableInCommunication: metric(
      share(accepted, cohort),
      "Part du périmètre dont l'image est utilisable en communication, en pourcentage : uniquement les autorisations explicites données pour l'année scolaire concernée. Les indécis ne comptent pas comme des autorisations, et une autorisation donnée une année précédente n'en est pas une non plus : elle a expiré et doit être redemandée.",
    ),
  };
}
