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
