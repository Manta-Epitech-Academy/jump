/**
 * The seeded random number generator.
 *
 * `Math.random()` is banned in this directory. A generator whose output moves
 * between two runs cannot be reasoned about: a screenshot stops matching, a
 * scenario nobody touched starts failing, and "it worked yesterday" becomes
 * unanswerable. The seed that produced a dataset is printed in the manifest, so
 * any run is reproducible from it.
 *
 * mulberry32 is chosen for being tiny, dependency-free and stable across
 * runtimes - not for statistical quality, which is irrelevant here.
 */

export type Rng = {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** True with probability `p`. */
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** A copy of `items` in a shuffled order. Never mutates its argument. */
  shuffle<T>(items: readonly T[]): T[];
  /** `count` distinct members of `items`, in shuffled order. */
  sample<T>(items: readonly T[], count: number): T[];
  /**
   * Picks by relative weight. This is how a distribution from PROFILE.md gets
   * applied: the weights are the percentages, and they need not sum to 100.
   */
  weighted<T>(entries: readonly (readonly [T, number])[]): T;
  /**
   * A child generator, derived from this one's seed and a label. Two scenarios
   * therefore draw from independent streams, so adding a scenario cannot shift
   * the numbers every other scenario gets. Without this, inserting one talent
   * anywhere would rewrite the whole dataset.
   */
  fork(label: string): Rng;
};

function hashLabel(seed: number, label: string): number {
  let h = seed ^ 0x9e3779b9;
  for (let i = 0; i < label.length; i += 1) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x01000193);
  }
  return h >>> 0;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => {
    if (max < min) throw new Error(`rng.int: max ${max} is below min ${min}`);
    return min + Math.floor(next() * (max - min + 1));
  };

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new Error('rng.pick: empty list');
    return items[int(0, items.length - 1)]!;
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = int(0, i);
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  };

  return {
    next,
    int,
    pick,
    shuffle,
    chance: (p) => next() < p,
    sample: (items, count) =>
      shuffle(items).slice(0, Math.max(0, Math.min(count, items.length))),
    weighted: (entries) => {
      if (entries.length === 0) throw new Error('rng.weighted: empty list');
      const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
      if (total <= 0) throw new Error('rng.weighted: weights sum to zero');
      let roll = next() * total;
      for (const [value, weight] of entries) {
        roll -= weight;
        if (roll < 0) return value;
      }
      return entries[entries.length - 1]![0];
    },
    fork: (label) => createRng(hashLabel(seed, label)),
  };
}
