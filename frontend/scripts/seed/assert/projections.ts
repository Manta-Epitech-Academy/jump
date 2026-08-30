/**
 * Projections must equal their facts.
 *
 * Several values in this schema are caches of an append-only ledger: `Talent.xp`
 * is the sum of its `XpGrant` rows, `Talent.eventsCount` is its present
 * participations, the flat onboarding columns are a copy of the most recent
 * dossier. The application recomputes each inside the writing transaction; the
 * generator writes them separately and therefore has to prove it got them right.
 *
 * A dataset that disagrees with itself here is worse than a small one. Every
 * screen showing a total beside its ledger shows the disagreement, and the first
 * assumption anybody makes is that the application is wrong.
 */

import type { PrismaClient } from '@prisma/client';
import { ONBOARDING_PROJECTED_FIELDS } from '../../../src/lib/domain/talentOnboarding';

export async function projectionFailures(
  prisma: PrismaClient,
): Promise<string[]> {
  const failures: string[] = [];

  const xpDrift = await prisma.$queryRaw<
    { id: string; xp: number; total: number }[]
  >`
    SELECT t."id", t."xp", COALESCE(SUM(g."amount"), 0)::int AS total
    FROM "Talent" t
    LEFT JOIN "XpGrant" g ON g."talentId" = t."id"
    WHERE t."id" LIKE 'sd_%'
    GROUP BY t."id", t."xp"
    HAVING t."xp" <> COALESCE(SUM(g."amount"), 0)::int
    LIMIT 5
  `;
  for (const row of xpDrift) {
    failures.push(
      `Talent.xp ${row.xp} ne vaut pas la somme du registre ${row.total} (${row.id})`,
    );
  }

  const countDrift = await prisma.$queryRaw<
    { id: string; cached: number; real: number }[]
  >`
    SELECT t."id", t."eventsCount" AS cached, COUNT(DISTINCT p."eventId")::int AS real
    FROM "Talent" t
    LEFT JOIN "EventPresence" p
      ON p."talentId" = t."id" AND p."status" IN ('present', 'late')
    WHERE t."id" LIKE 'sd_%'
    GROUP BY t."id", t."eventsCount"
    HAVING t."eventsCount" <> COUNT(DISTINCT p."eventId")::int
    LIMIT 5
  `;
  for (const row of countDrift) {
    failures.push(
      `Talent.eventsCount ${row.cached} ne vaut pas ${row.real} présences distinctes (${row.id})`,
    );
  }

  // The projection describes the MOST RECENT dossier, whatever year that is.
  // Comparing against the current year instead is the tempting mistake, and it
  // is what would make a guardian's late signature invisible.
  const projected = await prisma.talent.findMany({
    where: { id: { startsWith: 'sd_' }, onboardingSchoolYear: { not: null } },
    select: {
      id: true,
      onboardingSchoolYear: true,
      ...Object.fromEntries(
        ONBOARDING_PROJECTED_FIELDS.map((field) => [field, true]),
      ),
      onboardingRecords: {
        orderBy: { schoolYear: 'desc' },
        take: 1,
        select: Object.fromEntries(
          [...ONBOARDING_PROJECTED_FIELDS, 'schoolYear'].map((field) => [
            field,
            true,
          ]),
        ),
      },
    },
    take: 400,
  });

  for (const talent of projected) {
    const dossier = (talent.onboardingRecords as Record<string, unknown>[])[0];
    if (!dossier) {
      failures.push(
        `Talent ${talent.id} projette une année sans dossier correspondant`,
      );
      continue;
    }
    if (dossier.schoolYear !== talent.onboardingSchoolYear) {
      failures.push(
        `Talent ${talent.id} est estampillé ${String(talent.onboardingSchoolYear)} alors que son dossier le plus récent est ${String(dossier.schoolYear)}`,
      );
      continue;
    }
    for (const field of ONBOARDING_PROJECTED_FIELDS) {
      const onTalent = (talent as unknown as Record<string, unknown>)[field];
      const onDossier = dossier[field];
      const same =
        onTalent instanceof Date && onDossier instanceof Date
          ? onTalent.getTime() === onDossier.getTime()
          : (onTalent ?? null) === (onDossier ?? null);
      if (!same) {
        failures.push(`Talent ${talent.id} : ${field} diverge de son dossier`);
        break;
      }
    }
  }

  return failures;
}
