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

export async function runChecks(
  prisma: PrismaClient,
  log: (message: string) => void,
  clock: Clock,
): Promise<number> {
  const groups: [string, string[]][] = [
    ['couverture des énumérations', await missingEnumValues(prisma)],
    ['projections', await projectionFailures(prisma)],
    ['états atteignables', await reachabilityFailures(prisma, clock.today)],
    ['horodatages ancrés', await clockFailures(prisma, clock.today)],
    [
      'catalogues texte',
      await stringCatalogueFailures(prisma, clock.schoolYear),
    ],
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
  return failed;
}
