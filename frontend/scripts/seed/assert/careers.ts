/**
 * A talent's parcours, and the ledger that hangs off it.
 *
 * These are statements the generator MAKES, so they are statements something
 * has to check. Every one of them holds at every profile, because each is
 * carried by a state the generator PLACES rather than draws - the `parcours`
 * scenario's three profiles, and the club season whose length is a calendar.
 *
 * The PROPORTIONS are deliberately not here. « 69% of talents came once » is a
 * claim about a dataset's volume, it depends on the profile, and asserting it
 * would make the smallest profile fail for being small - the exact mistake
 * `seed/CLAUDE.md` warns about. What is asserted is that the SHAPES exist:
 * somebody came back many times, somebody carries several closings, and the two
 * disjoint tops production actually has are both present.
 */

import type { PrismaClient } from '@prisma/client';

/** The attendance tail a parcours screen is judged at. */
const MIN_TOP_ATTENDANCE = 8;
/** Enough closings that a history is a history and not a row. */
const MIN_TOP_CLOSINGS = 3;
/** What « assidu » means for the purpose of the disjoint-tops check. */
const ASSIDUOUS_EVENTS = 5;
/** What « a lot of XP » means. Production's 95th percentile is 1 767. */
const HIGH_XP = 2000;

export async function careerFailures(prisma: PrismaClient): Promise<string[]> {
  const failures: string[] = [];

  const [attendance] = await prisma.$queryRaw<{ most: number }[]>`
    SELECT COALESCE(MAX(n), 0)::int AS most
    FROM (
      SELECT COUNT(*) AS n
      FROM "Participation"
      WHERE "talentId" LIKE 'sd_%'
      GROUP BY "talentId"
    ) counts
  `;
  if ((attendance?.most ?? 0) < MIN_TOP_ATTENDANCE) {
    failures.push(
      `Le talent le plus assidu n'a que ${attendance?.most ?? 0} inscriptions, il en faut ${MIN_TOP_ATTENDANCE} : la queue d'assiduité vient de la saison du Coding Club, dont la longueur est un calendrier et non un volume`,
    );
  }

  // Distinct events, not rows: a closing is per (talent, event), so counting
  // rows would also pass on a talent closed three times on one event - which
  // the schema does not allow, and which is therefore the wrong thing to ask.
  const [closings] = await prisma.$queryRaw<{ most: number }[]>`
    SELECT COALESCE(MAX(n), 0)::int AS most
    FROM (
      SELECT COUNT(DISTINCT "eventId") AS n
      FROM "Closing_Record"
      WHERE "talentId" LIKE 'sd_%'
      GROUP BY "talentId"
    ) counts
  `;
  if ((closings?.most ?? 0) < MIN_TOP_CLOSINGS) {
    failures.push(
      `Aucun talent ne porte ${MIN_TOP_CLOSINGS} closings sur autant d'événements (au mieux ${closings?.most ?? 0}) : « Son parcours » n'a rien à afficher`,
    );
  }

  // The two tops production has, and they are different people. Asserting only
  // « somebody has a lot of XP » would pass on a dataset that handed XP out in
  // proportion to attendance, which is the shape the leaderboard is NOT.
  const [assiduous] = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n
    FROM "Talent" t
    WHERE t."id" LIKE 'sd_%'
      AND t."xp" = 0
      AND t."firstLoginAt" IS NULL
      AND (
        SELECT COUNT(*) FROM "Participation" p WHERE p."talentId" = t."id"
      ) >= ${ASSIDUOUS_EVENTS}
  `;
  if ((assiduous?.n ?? 0) === 0) {
    failures.push(
      `Aucun talent assidu (${ASSIDUOUS_EVENTS} inscriptions ou plus) à 0 XP et jamais connecté : c'est la forme de TOUS les talents en haut de la queue d'assiduité en production`,
    );
  }

  const [player] = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n
    FROM "Talent" t
    WHERE t."id" LIKE 'sd_%'
      AND t."xp" >= ${HIGH_XP}
      AND (
        SELECT COUNT(*) FROM "Participation" p WHERE p."talentId" = t."id"
      ) < 3
  `;
  if ((player?.n ?? 0) === 0) {
    failures.push(
      `Aucun talent au-dessus de ${HIGH_XP} XP avec moins de 3 inscriptions : en production le sommet du classement est un joueur quotidien à deux événements, pas le plus assidu`,
    );
  }

  // The ranking, read back off the field rather than trusted. `rankXpAwarded`
  // is written by `World.rankMinigameFields` from the results, so a publication
  // with a real field must carry a first, a second and a third - and the row
  // holding the first place must be the best result on it.
  const [board] = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n
    FROM (
      SELECT "publicationId"
      FROM "MinigameAttempt"
      WHERE "status" = 'done' AND "id" LIKE 'sd_%'
      GROUP BY "publicationId"
      HAVING COUNT(*) >= 3
         AND COUNT(*) FILTER (WHERE "rankXpAwarded" = 100) = 1
         AND COUNT(*) FILTER (WHERE "rankXpAwarded" = 50) = 1
         AND COUNT(*) FILTER (WHERE "rankXpAwarded" = 25) = 1
    ) fields
  `;
  if ((board?.n ?? 0) === 0) {
    failures.push(
      'Aucune publication ne porte un podium complet (1re, 2e, 3e place) : les bonus de rang ne sont donc vérifiés nulle part',
    );
  }

  // And the winner is the best result, which is the whole claim of computing a
  // rank from the field instead of passing one in. Chrono games rank low-to-high
  // and score games high-to-low, so both directions are checked.
  const misranked = await prisma.$queryRaw<
    { publicationId: string; scoring: string }[]
  >`
    SELECT a."publicationId", p."scoringType"::text AS scoring
    FROM "MinigameAttempt" a
    JOIN "MinigamePublication" p ON p."id" = a."publicationId"
    WHERE a."rankXpAwarded" = 100
      AND a."id" LIKE 'sd_%'
      AND EXISTS (
        SELECT 1 FROM "MinigameAttempt" b
        WHERE b."publicationId" = a."publicationId"
          AND b."status" = 'done'
          AND CASE
                WHEN p."scoringType" = 'score' THEN b."score" > a."score"
                ELSE b."chrono" < a."chrono"
              END
      )
    LIMIT 5
  `;
  for (const row of misranked) {
    failures.push(
      `La 1re place de ${row.publicationId} (${row.scoring}) n'est pas le meilleur résultat du champ : un rang est une propriété du champ, pas une valeur qu'on écrit`,
    );
  }

  return failures;
}
