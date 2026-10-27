import { describe, expect, it } from 'vitest';
import { inkOn } from './color';

describe('inkOn', () => {
  it.each([
    ['#013afb', 'light'],
    ['#00ff97', 'dark'],
    ['#ff1ef7', 'dark'],
    ['#ff5f3a', 'dark'],
  ] as const)(
    'should give %s the ink the 2027 mockup paints on it (%s)',
    (fill, ink) => {
      // Arrange / Act / Assert: the four brand accents are the mockup's four
      // event categories, each painted with a hand-picked text colour.
      expect(inkOn(fill)).toBe(ink);
    },
  );

  it('should keep the dark ink on a near-white fill', () => {
    // Arrange: a colour is the team's free choice, white included.
    const fill = '#fafafa';

    // Act / Assert
    expect(inkOn(fill)).toBe('dark');
  });
});
