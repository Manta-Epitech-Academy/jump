/**
 * Who is legally in order, and who is not.
 *
 * Three separate obligations, deliberately kept apart because they are three
 * different documents that people routinely conflate:
 *
 *   - the **charte de données** (RGPD), which the talent accepts to use Jump;
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

import { prisma } from '$lib/server/db';
import { IMAGE_RIGHTS_STATUS_LABELS } from '$lib/domain/imageRights';
import { metric, share, type Metric } from '$lib/server/adminApi/metrics';
import type { Scope } from '$lib/server/adminApi/scope';
import { cohortWhere, scopeLabels } from './cohort';

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
  rulesAwaitingGuardian: Metric;
  imageRights: Metric<ImageRightsRow[]>;
  usableInCommunication: Metric<number | null>;
};

export async function getComplianceStatus(
  scope: Scope = {},
): Promise<ComplianceStatus> {
  const where = await cohortWhere(scope);
  const and = (extra: object) => ({ where: { AND: [where, extra] } });

  const [cohort, charter, rulesTalent, rulesGuardian, accepted, refused] =
    await Promise.all([
      prisma.talent.count({ where }),
      prisma.talent.count(and({ charterAcceptedAt: { not: null } })),
      prisma.talent.count(and({ rulesSignedAt: { not: null } })),
      prisma.talent.count(and({ parentRulesSignedAt: { not: null } })),
      prisma.talent.count(and({ imageRightsDecision: 'accepted' })),
      prisma.talent.count(and({ imageRightsDecision: 'refused' })),
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
      "Talents ayant accepté la charte de traitement des données personnelles. C'est le document RGPD qui conditionne l'usage de Jump, distinct du règlement intérieur.",
    ),
    charterAcceptedShare: metric(
      share(charter, cohort),
      'Part du périmètre ayant accepté la charte de données, en pourcentage.',
    ),
    rulesSignedByTalent: metric(
      rulesTalent,
      'Talents ayant signé le règlement intérieur eux-mêmes, en ligne, pendant leur inscription.',
    ),
    rulesSignedByTalentShare: metric(
      share(rulesTalent, cohort),
      'Part du périmètre ayant signé le règlement intérieur, en pourcentage.',
    ),
    rulesCosignedByGuardian: metric(
      rulesGuardian,
      "Talents dont le responsable légal a contresigné le règlement intérieur. Pour un mineur, c'est cette contresignature qui rend le document complet.",
    ),
    rulesAwaitingGuardian: metric(
      Math.max(rulesTalent - rulesGuardian, 0),
      "Talents qui ont signé le règlement mais dont le responsable légal ne l'a pas encore contresigné : ceux qu'il reste à relancer, côté parent.",
    ),
    imageRights: metric(
      [
        imageRow('accepted', accepted),
        imageRow('refused', refused),
        imageRow('undecided', undecided),
      ],
      "Décision du responsable légal sur le droit à l'image, en trois états. « Refusé » est une réponse arrêtée, pas une signature manquante : cet élève ne doit pas être photographié. « En attente » signifie que personne n'a encore répondu.",
    ),
    usableInCommunication: metric(
      share(accepted, cohort),
      "Part du périmètre dont l'image est utilisable en communication, en pourcentage : uniquement les autorisations explicites. Les indécis ne comptent pas comme des autorisations.",
    ),
  };
}
