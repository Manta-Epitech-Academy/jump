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
import {
  IMAGE_RIGHTS_STATUS_LABELS,
  imageRightsStance,
} from '$lib/domain/imageRights';
import { latestImageRightsDecisions } from '../imageRightsService';
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
  imageUseForbidden: Metric;
  imageUseForbiddenShare: Metric<number | null>;
  usableInCommunication: Metric<number | null>;
};

/**
 * Talents of the périmètre who must not be photographed, resolved by
 * {@link imageRightsStance}: the one image-rights question that is not about a
 * school year.
 *
 * Two disjoint halves of `stance === 'forbidden'`, split so that only the second
 * needs the ledger ORDERED:
 *
 *  1. the dossier in hand carries a refusal, which is a plain count;
 *  2. nothing is decided for it and the last decision the guardian ever made was
 *     a refusal. Which decision is the last one cannot be asked in SQL here, so
 *     the candidates are narrowed first to those undecided today who have refused
 *     at least once - a small minority of any cohort, and an EXISTS on an indexed
 *     relation - and only those rows are read back and ordered.
 *
 * A lapsed AUTHORIZATION is deliberately not here: it resolves to `unknown`, not
 * to consent and not to an interdiction.
 */
async function countForbiddenNow(
  where: Prisma.TalentWhereInput,
): Promise<number> {
  const [refusedForDossierInHand, candidates] = await Promise.all([
    prisma.talent.count({
      where: { AND: [where, { imageRightsDecision: 'refused' }] },
    }),
    prisma.talent.findMany({
      where: {
        AND: [
          where,
          { imageRightsDecision: null },
          { imageRightsRecords: { some: { decision: 'refused' } } },
        ],
      },
      select: { id: true },
    }),
  ]);

  const latest = await latestImageRightsDecisions(candidates.map((t) => t.id));
  // `'undecided'` is a constant here, not a shortcut: the query above selected on
  // exactly that. The stance is still resolved by the domain rule rather than
  // re-derived, so a change to what a lapsed decision means lands here too.
  const standingRefusals = candidates.filter(
    (t) =>
      imageRightsStance('undecided', latest.get(t.id)?.decision ?? null) ===
      'forbidden',
  ).length;

  return refusedForDossierInHand + standingRefusals;
}

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

  const [
    cohort,
    charter,
    rulesTalent,
    rulesGuardian,
    accepted,
    refused,
    forbiddenNow,
  ] = await Promise.all([
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
    countForbiddenNow(where),
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
      "Décision du responsable légal sur le droit à l'image pour l'année scolaire concernée, en trois états. La décision est redemandée à chaque année scolaire, donc ces trois chiffres disent où en est la campagne de cette année-là, et « En attente » signifie que personne n'a répondu pour cette année-là, pas que personne n'a jamais répondu. « Refusé » est une réponse arrêtée, pas une signature manquante : c'est le nombre de familles qu'il est inutile de relancer. Pour savoir combien d'élèves ne doivent pas être photographiés aujourd'hui, lire le chiffre « Interdictions en vigueur » de cette même réponse : un refus donné une année continue de s'appliquer, et il est alors compté ici en « En attente » puisque la décision de l'année en cours reste à donner.",
    ),
    imageUseForbidden: metric(
      forbiddenNow,
      "Interdictions en vigueur : les élèves du périmètre dont l'image ne doit pas être utilisée aujourd'hui, ceux dont le responsable légal a refusé pour le dossier en cours, plus ceux dont le dernier refus n'a jamais été remplacé par une décision nouvelle. C'est le seul chiffre à consulter avant de publier une photo, et c'est aussi le seul de cette réponse que le filtre d'année scolaire ne restreint pas : une autorisation expire, une interdiction non. Une autorisation donnée une année précédente et non renouvelée n'est comptée ni ici ni parmi les autorisations : personne n'a interdit, mais personne n'a autorisé pour cette année.",
    ),
    imageUseForbiddenShare: metric(
      share(forbiddenNow, cohort),
      "Part du périmètre sous interdiction en vigueur, c'est-à-dire dont l'image ne doit pas être utilisée aujourd'hui, en pourcentage. Complément de « part utilisable en communication », mais les deux ne totalisent pas 100 % : entre les deux se trouvent les élèves dont personne n'a encore décidé pour cette année.",
    ),
    usableInCommunication: metric(
      share(accepted, cohort),
      "Part du périmètre dont l'image est utilisable en communication, en pourcentage : uniquement les autorisations explicites données pour l'année scolaire concernée. Les indécis ne comptent pas comme des autorisations, et une autorisation donnée une année précédente n'en est pas une non plus : elle a expiré et doit être redemandée.",
    ),
  };
}
