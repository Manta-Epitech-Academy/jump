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
 * family) gets a line, and a scenario that places every value of it.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { JUMP_LEVELS, levelXpFilter } from '../../../src/lib/domain/xp';

type DerivedVocabulary = {
  /** Human name, used in the failure line. */
  name: string;
  /** Where the value comes from, said in the failure line. */
  derivedFrom: string;
  /** The values no seeded talent carries. */
  missing: (prisma: PrismaClient) => Promise<string[]>;
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
];

export async function derivedStateFailures(
  prisma: PrismaClient,
): Promise<string[]> {
  const failures: string[] = [];
  for (const { name, derivedFrom, missing } of VOCABULARIES) {
    for (const value of await missing(prisma)) {
      failures.push(
        `Aucun talent semé au ${name} « ${value} » (${derivedFrom}) : un écran qui l'affiche n'a rien à montrer, et aucune colonne ne le dit`,
      );
    }
  }
  return failures;
}
