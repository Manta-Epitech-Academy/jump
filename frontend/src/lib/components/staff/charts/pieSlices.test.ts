import { describe, it, expect } from 'vitest';
import { pieSlices } from './pieSlices';

const BOX = { cx: 60, cy: 60, r: 60 };

describe('pieSlices', () => {
  it('cuts two parts into slices that meet where the first one stops', () => {
    // The « Inscrits par genre » disc of 29/10/2026: 14 and 4.
    const [homme, femme] = pieSlices(
      [
        { key: 'homme', count: 14 },
        { key: 'femme', count: 4 },
      ],
      BOX,
    );
    expect(homme.path).toMatch(/^M 60 60 L 60 0 A 60 60 0 1 1 /);
    const end = homme.path!.split(' ').slice(-3, -1).join(' ');
    expect(femme.path).toContain(`L ${end} A 60 60 0 0 1 60 0 Z`);
  });

  it('draws a part that is the whole disc as a circle, not as an empty arc', () => {
    const slices = pieSlices([{ key: 'premiere', count: 18 }], BOX);
    expect(slices).toEqual([{ key: 'premiere', count: 18, path: null }]);
  });

  it('leaves out a part with no count, and draws nothing for an empty whole', () => {
    expect(
      pieSlices(
        [
          { key: 'a', count: 3 },
          { key: 'b', count: 0 },
        ],
        BOX,
      ).map((s) => s.key),
    ).toEqual(['a']);
    expect(pieSlices([{ key: 'a', count: 0 }], BOX)).toEqual([]);
  });
});
