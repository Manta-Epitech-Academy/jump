/**
 * Identifiers.
 *
 * Every row this generator writes gets a readable, derived id rather than a
 * `cuid()`. Two reasons, and the second is the one that matters day to day.
 *
 * Derived: the same seed produces the same ids, so two runs are diffable and a
 * scenario can reference another scenario's row without a lookup.
 *
 * Readable: `sd_evt_lyon_stage_2nde` in a bug report, a log line or a URL says
 * what it is. A cuid says nothing, and a screenshot carrying one is useless the
 * next time the database is rebuilt.
 *
 * The `sd_` prefix is load-bearing: it is how `wipe()` tells generated rows from
 * anything else, and how a human reading production-shaped data can tell at a
 * glance that a row is fake.
 */

export const SEED_ID_PREFIX = 'sd_';

/**
 * How a DATABASE says it was generated, as opposed to how a ROW does.
 *
 * The two markers are a pair, which is why they live together. The prefix above
 * answers "did this generator write this row", and `wipe()` reads it to know
 * what to remove. This key answers "has this generator ever run here", and
 * `assertGeneratorOwnsDataset` reads it to tell a switchover from a re-seed.
 *
 * It is the key of the manifest row `index.ts` upserts at the end of every full
 * run, so the marker is a by-product of an artifact that already had to exist
 * rather than a flag added for the gate. Three properties make it usable as
 * one, and all three are accidents of the manifest's own design rather than
 * promises somebody has to keep: `wipe()` never removes it (`AppSetting` is
 * keyed on `key`, not on a prefixable `id`), `--catalog-only` never writes it,
 * and `prisma migrate reset` destroys it along with everything else.
 */
export const MANIFEST_SETTING_KEY = 'seed.manifest';

const SLUG_UNSAFE = /[^a-z0-9]+/g;

export function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(SLUG_UNSAFE, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * `id('evt', 'lyon', 'stage 2nde')` -> `sd_evt_lyon_stage_2nde`.
 *
 * Throws on an empty part rather than silently producing a colliding id: a
 * scenario that forgets to pass a discriminant would otherwise overwrite its own
 * rows and look like it had simply created fewer.
 */
export function id(kind: string, ...parts: (string | number)[]): string {
  const tail = parts.map((part) => slug(String(part)));
  if (tail.some((part) => part.length === 0)) {
    throw new Error(`id(${kind}): empty part in [${parts.join(', ')}]`);
  }
  return [SEED_ID_PREFIX + slug(kind), ...tail].join('_');
}

/** Zero-padded sequence part, so ids sort the way humans expect. */
export function seq(n: number, width = 4): string {
  return String(n).padStart(width, '0');
}

export function isSeedId(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(SEED_ID_PREFIX);
}
