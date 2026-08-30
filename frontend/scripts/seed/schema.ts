/**
 * The schema, parsed once.
 *
 * Two things here need to know what `schema.prisma` declares rather than what
 * the generated client exposes: enum coverage, and which columns Prisma would
 * fill from the wall clock. The client's own `Prisma.dmmf` is trimmed at build
 * time - it carries neither `isUpdatedAt` nor a field's default - so both read
 * the schema through `getDMMF`, the same way `scripts/gen-db-erd.ts` does.
 *
 * Memoised because parsing it is not free and a run asks for it twice.
 */

import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { getDMMF } from '@prisma/internals';

type Datamodel = Awaited<ReturnType<typeof getDMMF>>['datamodel'];

let pending: Promise<Datamodel> | null = null;

export function loadDatamodel(): Promise<Datamodel> {
  pending ??= (async () => {
    const schemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
    const datamodel = await readFile(schemaPath, 'utf8');
    return (await getDMMF({ datamodel })).datamodel;
  })();
  return pending;
}
