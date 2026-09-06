/**
 * The verification pass.
 *
 * It runs after every generation, not as a separate suite, which is a deliberate
 * choice: a check you have to remember to run separately is a check that stops
 * being run. `bun run test:seed` is this, against a disposable database, inside
 * `verify`.
 */

import type { PrismaClient } from '@prisma/client';
import type { Clock } from '../clock';
import { clockFailures } from './clock';
import { missingEnumValues } from './enums';
import { stringCatalogueFailures } from './stringCatalogues';
import { projectionFailures } from './projections';
import { reachabilityFailures } from './reachability';
import { inertnessFailures } from './inertness';
import { coverageFailures, KNOWN_GAP_COUNT } from './coverage';
import { usageCoherenceFailures } from './usageCoherence';

export async function runChecks(
  prisma: PrismaClient,
  log: (message: string) => void,
  clock: Clock,
): Promise<number> {
  const groups: [string, string[]][] = [
    ['couverture des énumérations', await missingEnumValues(prisma)],
    ['couverture du schéma', await coverageFailures(prisma)],
    ['projections', await projectionFailures(prisma)],
    ['états atteignables', await reachabilityFailures(prisma, clock.today)],
    ['inertie aux workers', await inertnessFailures(prisma)],
    ['horodatages ancrés', await clockFailures(prisma, clock.today)],
    [
      'catalogues texte',
      await stringCatalogueFailures(prisma, clock.schoolYear),
    ],
    ['cohérence des usages', await usageCoherenceFailures(prisma)],
  ];

  let failed = 0;
  for (const [label, failures] of groups) {
    if (failures.length === 0) {
      log(`  ok   ${label}`);
      continue;
    }
    failed += failures.length;
    log(`  ÉCHEC ${label}`);
    for (const failure of failures) log(`         ${failure}`);
  }

  // Printed whether it is zero or not. The number is the length of
  // `NOT_YET_SEEDED`, and the check above is what guarantees it is exact: a gap
  // that has been closed fails until its line goes. So this is a measurement,
  // not a claim, and it is the one line to watch move.
  if (KNOWN_GAP_COUNT > 0) {
    log(
      `  dette couverture : ${KNOWN_GAP_COUNT} écart(s) connu(s) et acceptés`,
    );
  }

  return failed;
}
