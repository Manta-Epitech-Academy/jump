/**
 * No row this generator wrote may be stamped after the anchor.
 *
 * The generator's hard rule is that nothing reads the wall clock, and the place
 * it is easiest to break without noticing is the column nobody writes: Prisma
 * fills `@default(now())` and `@updatedAt` from the real clock whenever a caller
 * leaves them out. `writer.ts` stamps those from `--today`; this proves it, over
 * every table that has one.
 *
 * A miss is not cosmetic. It makes a run irreproducible - same `--seed`, same
 * `--today`, different rows - and it produces rows the application could never
 * have written: a record created months after the act it records.
 *
 * Only the generator's own rows are examined, and only in tables whose key is a
 * single prefixed id. Migrations insert rows with a real `now()` (the closing
 * bank, the diploma templates) and rewriting those is not this run's job.
 */

import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { SEED_ID_PREFIX } from '../ids';
import { loadDatamodel } from '../schema';

export async function clockFailures(
  prisma: PrismaClient,
  anchor: Date,
): Promise<string[]> {
  const failures: string[] = [];
  const datamodel = await loadDatamodel();

  for (const model of datamodel.models) {
    const stamped = model.fields
      .filter(
        (field) =>
          field.type === 'DateTime' &&
          (field.isUpdatedAt || field.default !== undefined),
      )
      .map((field) => field.name);
    if (stamped.length === 0) continue;

    const owner = model.fields.find(
      (field) => field.name === 'id' && field.type === 'String',
    );
    if (!owner) continue;

    const table = Prisma.raw(`"${model.dbName ?? model.name}"`);
    for (const column of stamped) {
      const late = await prisma.$queryRaw<{ id: string; value: Date }[]>`
        SELECT "id", ${Prisma.raw(`"${column}"`)} AS value
        FROM ${table}
        WHERE "id" LIKE ${`${SEED_ID_PREFIX}%`}
          AND ${Prisma.raw(`"${column}"`)} > ${anchor}
        LIMIT 3
      `;
      for (const row of late) {
        failures.push(
          `${model.name}.${column} vaut ${row.value.toISOString()}, après l’ancre (${row.id})`,
        );
      }
    }
  }

  return failures;
}
