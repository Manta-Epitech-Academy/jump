/**
 * Enum coverage, read from the schema.
 *
 * This is the piece that makes the generator maintain itself. The list of
 * enums is NOT written here: it is parsed out of `schema.prisma` with the same
 * `getDMMF` that `scripts/gen-db-erd.ts` already uses. So the day somebody adds
 * a module key, an XP source, a presence status or a broadcast state, this check
 * starts demanding a row for it, in the pull request that added it, without
 * anybody having remembered to update a list.
 *
 * That inverts the usual failure. A hand-maintained coverage list goes stale
 * silently and the first sign is a screen nobody could test; a derived one fails
 * loudly and immediately, on the branch responsible.
 *
 * Nullable enum columns are counted as covered by their values only. A `null` is
 * not an enum value, and demanding one would force a nonsense row for every
 * optional column in the schema.
 */

import path from 'node:path';
import { getDMMF } from '@prisma/internals';
import { readFile } from 'node:fs/promises';
import type { PrismaClient } from '@prisma/client';

export type EnumTarget = {
  enumName: string;
  model: string;
  field: string;
  values: string[];
};

/** Where each enum is actually used, so a value can be counted somewhere. */
export async function enumTargets(): Promise<EnumTarget[]> {
  const schemaPath = path.resolve(__dirname, '../../../prisma/schema.prisma');
  const datamodel = await readFile(schemaPath, 'utf8');
  const dmmf = await getDMMF({ datamodel });

  const byName = new Map(
    dmmf.datamodel.enums.map((entry) => [
      entry.name,
      entry.values.map((v) => v.name),
    ]),
  );
  const targets: EnumTarget[] = [];

  for (const model of dmmf.datamodel.models) {
    for (const field of model.fields) {
      if (field.kind !== 'enum') continue;
      const values = byName.get(field.type);
      if (!values) continue;
      targets.push({
        enumName: field.type,
        model: model.name,
        field: field.name,
        values,
      });
    }
  }

  return targets;
}

/**
 * An enum can be carried by several columns. It is covered when EVERY value
 * appears somewhere, not when every column carries every value: demanding the
 * latter would require, say, a refused image-rights decision on both the dossier
 * projection and the decision ledger for every combination, which says nothing
 * extra.
 */
export async function missingEnumValues(
  prisma: PrismaClient,
): Promise<string[]> {
  const targets = await enumTargets();
  const seen = new Map<string, Set<string>>();
  const known = new Map<string, string[]>();

  for (const target of targets) {
    known.set(target.enumName, target.values);
    const delegateName = `${target.model.charAt(0).toLowerCase()}${target.model.slice(1)}`;
    const delegate = (prisma as unknown as Record<string, unknown>)[
      delegateName
    ] as
      | { groupBy(args: unknown): Promise<Record<string, unknown>[]> }
      | undefined;
    if (!delegate?.groupBy) continue;

    const rows = await delegate.groupBy({
      by: [target.field],
      _count: { _all: true },
    });
    const found = seen.get(target.enumName) ?? new Set<string>();
    for (const row of rows) {
      const value = row[target.field];
      if (typeof value === 'string') found.add(value);
    }
    seen.set(target.enumName, found);
  }

  const missing: string[] = [];
  for (const [enumName, values] of known) {
    const found = seen.get(enumName) ?? new Set<string>();
    const absent = values.filter((value) => !found.has(value));
    if (absent.length > 0) {
      missing.push(`${enumName}: aucune ligne pour ${absent.join(', ')}`);
    }
  }
  return missing;
}
