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

  // Every tier of the bonus, and nothing outside them. `minigameRankBonus` pays
  // 100, 50, 25 and a flat 10 for the honourable-mention tail, and that tail
  // only exists on a board big enough for the top decile to reach past the
  // podium - so a dataset missing it is one whose boards are all tiny.
  const tiers = await prisma.$queryRaw<{ bonus: number; n: bigint }[]>`
    SELECT "rankXpAwarded" AS bonus, COUNT(*) AS n
    FROM "MinigameAttempt"
    WHERE "rankXpAwarded" IS NOT NULL AND "id" LIKE 'sd_%'
    GROUP BY 1
  `;
  const paid = new Set(tiers.map((row) => row.bonus));
  for (const tier of [100, 50, 25, 10]) {
    if (!paid.has(tier)) {
      failures.push(
        `Aucun bonus de rang à ${tier} XP : les quatre paliers de minigameRankBonus ne sont pas tous atteints, donc le classement n'est vérifié que partiellement`,
      );
    }
  }
  for (const row of tiers) {
    if (![100, 50, 25, 10].includes(row.bonus)) {
      failures.push(
        `Bonus de rang de ${row.bonus} XP, que minigameRankBonus ne produit pas : le générateur a écrit un montant au lieu de le demander au domaine`,
      );
    }
  }

  // The no-clawback rule, which is the one property of the real ranking a tidy
  // final podium would NOT reproduce. `minigameService` pays the rank you held
  // the moment you finished and never revises it, so the FIRST run to finish on
  // a board was rank 1 of a field of 1 and must carry a first place - whatever
  // anybody managed afterwards. Getting this wrong is invisible in a count and
  // is worth about a thousand grants at production volume.
  const lateLeaders = await prisma.$queryRaw<
    { publicationId: string; campusId: string | null; bonus: number | null }[]
  >`
    SELECT DISTINCT ON (a."publicationId", a."campusId")
           a."publicationId", a."campusId", a."rankXpAwarded" AS bonus
    FROM "MinigameAttempt" a
    WHERE a."status" = 'done' AND a."id" LIKE 'sd_%'
    ORDER BY a."publicationId", a."campusId", a."finishedAt" ASC, a."id" ASC
  `;
  const unpaid = lateLeaders.filter((row) => row.bonus !== 100);
  for (const row of unpaid.slice(0, 5)) {
    failures.push(
      `Le premier à finir sur le board (${row.publicationId}, campus ${row.campusId ?? 'global'}) ne porte pas de première place mais ${row.bonus ?? 'aucun bonus'} : sans clawback, il était premier d'un champ de un`,
    );
  }

  return failures;
}
