/**
 * States the screens render that no column holds.
 *
 * Every other coverage check reads what is expressible off the schema: an enum
 * value, a nullable column, a boolean. A state the domain DERIVES from a column
 * is invisible to all of them. The Jump level is the case that set this file:
 * it is computed from `Talent.xp` and stored nowhere, #446 brought five of them,
 * the seed reached two, and every check stayed green while Hacker, Builder,
 * Expert and « Niveau maximum atteint » existed in no generated dataset.
 *
 * So each derived vocabulary is declared here by hand, which is the cost a
 * derived state cannot avoid: nothing announces that a function's result is a
 * screen state. What keeps the table honest is that its values and its bounds
 * are imported from the domain, never restated - a level the PO renames or
 * moves is checked as it now is, the day it changes.
 *
 * A new derived vocabulary a screen branches on (a level, a tier, a badge
 * family, the state of the home's hero) gets a line, and a scenario that
 * places every value of it. One that no single column filters on is computed
 * instead, by the domain's own function over the seeded rows (`homeHero.ts`).
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { JUMP_LEVELS, levelXpFilter } from '../../../src/lib/domain/xp';
import { HOME_HERO_STATES } from '../../../src/lib/domain/talentHome';
import type { Clock } from '../clock';
import { seededHomeHeroStates } from './homeHero';

type DerivedVocabulary = {
  /** Human name, used in the failure line. */
  name: string;
  /** Where the value comes from, said in the failure line. */
  derivedFrom: string;
  /** The values no seeded talent carries. */
  missing: (prisma: PrismaClient, clock: Clock) => Promise<string[]>;
};

/** A vocabulary, typed by its own values so `where` needs no cast. */
function vocabulary<T extends string>(spec: {
  name: string;
  derivedFrom: string;
  values: readonly T[];
  /** The talents carrying `value`. */
  where: (value: T) => Prisma.TalentWhereInput;
}): DerivedVocabulary {
  return {
    name: spec.name,
    derivedFrom: spec.derivedFrom,
    async missing(prisma) {
      const absent: string[] = [];
      for (const value of spec.values) {
        const count = await prisma.talent.count({
          where: { AND: [{ id: { startsWith: 'sd_' } }, spec.where(value)] },
        });
        if (count === 0) absent.push(value);
      }
      return absent;
    },
  };
}

const VOCABULARIES: readonly DerivedVocabulary[] = [
  vocabulary({
    name: 'niveau Jump',
    derivedFrom: 'computeLevel(Talent.xp)',
    values: JUMP_LEVELS,
    where: (level) => ({ xp: levelXpFilter(level) }),
  }),
  {
    // Not a filter on one column, so computed: each seeded talent's hero by
    // the domain's own rule, at mid-morning on the anchor day. The scenario
    // that places them (`bandeau-accueil`) makes every state hold at any hour,
    // so the instant read here is not a choice the result depends on.
    name: 'bandeau d’accueil, état',
    derivedFrom: 'pickHomeHero, à 10 h UTC le jour d’ancrage',
    async missing(prisma, clock) {
      const carried = await seededHomeHeroStates(prisma, clock.at(0, 10));
      return HOME_HERO_STATES.filter((state) => !carried.has(state));
    },
  },
];

export async function derivedStateFailures(
  prisma: PrismaClient,
  clock: Clock,
): Promise<string[]> {
  const failures: string[] = [];
  for (const { name, derivedFrom, missing } of VOCABULARIES) {
    for (const value of await missing(prisma, clock)) {
      failures.push(
        `Aucun talent semé au ${name} « ${value} » (${derivedFrom}) : un écran qui l'affiche n'a rien à montrer, et aucune colonne ne le dit`,
      );
    }
  }
  return failures;
}
