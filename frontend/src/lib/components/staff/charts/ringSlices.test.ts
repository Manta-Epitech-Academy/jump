import { describe, it, expect } from 'vitest';
import { ringSlices } from './ringSlices';

const DISC = { cx: 60, cy: 60, r: 60, inner: 0 };
const RING = { cx: 60, cy: 60, r: 55, inner: 45 };

describe('ringSlices', () => {
  it('cuts two parts into disc slices that meet where the first one stops', () => {
    // The « Inscrits par genre » disc of 29/10/2026: 14 and 4.
    const [homme, femme] = ringSlices(
      [
        { key: 'homme', count: 14 },
        { key: 'femme', count: 4 },
      ],
      DISC,
    );
    expect(homme.path).toMatch(/^M 60 60 L 60 0 A 60 60 0 1 1 /);
    const end = homme.path.split(' ').slice(-3, -1).join(' ');
    expect(femme.path).toContain(`L ${end} A 60 60 0 0 1 60 0 Z`);
  });

  it('draws a thin last part of a ring as a filled outline closing at twelve', () => {
    // The « Inscrits par niveau » ring of 22/11/2026: 107 and 1. As a dash on a
    // stroked circle, the 1 ended on the circle's own start and came out
    // notched.
    const [, terminale] = ringSlices(
      [
        { key: 'premiere', count: 107 },
        { key: 'terminale', count: 1 },
      ],
      RING,
    );
    expect(terminale.path).toMatch(
      /^M [\d.]+ [\d.]+ A 55 55 0 0 1 60 5 L 60 15 A 45 45 0 0 0 [\d.]+ [\d.]+ Z$/,
    );
  });

  it('draws a part that is the whole as two half arcs, with a hole for a ring', () => {
    const [disc] = ringSlices([{ key: 'premiere', count: 18 }], DISC);
    expect(disc.path).toBe('M 60 0 A 60 60 0 1 1 60 120 A 60 60 0 1 1 60 0 Z');

    const [ring] = ringSlices([{ key: 'premiere', count: 18 }], RING);
    expect(ring.path).toBe(
      'M 60 5 A 55 55 0 1 1 60 115 A 55 55 0 1 1 60 5 Z ' +
        'M 60 15 A 45 45 0 1 0 60 105 A 45 45 0 1 0 60 15 Z',
    );
  });

  it('leaves out a part with no count, and draws nothing for an empty whole', () => {
    expect(
      ringSlices(
        [
          { key: 'a', count: 3 },
          { key: 'b', count: 0 },
        ],
        DISC,
      ).map((s) => s.key),
    ).toEqual(['a']);
    expect(ringSlices([{ key: 'a', count: 0 }], RING)).toEqual([]);
  });
});
