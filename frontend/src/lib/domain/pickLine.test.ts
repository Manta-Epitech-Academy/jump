import { describe, it, expect } from 'vitest';
import { pickLine } from './pickLine';

describe('pickLine', () => {
  const lines = ['a', 'b', 'c'];

  it('picks the same line for the same key, so the server render and the page agree', () => {
    expect(pickLine(lines, '/staff/dev/events/e1/inscrits')).toBe(
      pickLine(lines, '/staff/dev/events/e1/inscrits'),
    );
  });

  it('spreads keys over every line', () => {
    const picked = new Set(
      Array.from({ length: 30 }, (_, i) =>
        pickLine(lines, `/staff/dev/events/e${i}/closings`),
      ),
    );
    expect(picked).toEqual(new Set(lines));
  });
});
