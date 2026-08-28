import { describe, expect, it } from 'vitest';
import { pageCount, paginate } from './paginate';

const rows = Array.from({ length: 7 }, (_, i) => i);

describe('pageCount', () => {
  it('counts a partial last page', () => {
    expect(pageCount(7, 3)).toBe(3);
  });

  it('is zero for an empty list, so the control hides itself', () => {
    expect(pageCount(0, 25)).toBe(0);
  });
});

describe('paginate', () => {
  it('slices the requested page', () => {
    expect(paginate(rows, 1, 3)).toEqual([0, 1, 2]);
    expect(paginate(rows, 3, 3)).toEqual([6]);
  });

  it('clamps a page past the end onto the last one', () => {
    expect(paginate(rows, 9, 3)).toEqual([6]);
  });

  it('clamps a page below one', () => {
    expect(paginate(rows, 0, 3)).toEqual([0, 1, 2]);
  });

  it('returns nothing for an empty list', () => {
    expect(paginate([], 1, 3)).toEqual([]);
  });
});
