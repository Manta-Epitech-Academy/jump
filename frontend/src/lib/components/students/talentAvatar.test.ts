import { describe, expect, it } from 'vitest';
import { contrastRatio } from '$lib/design/contract';
import { AVATAR_GROUNDS, talentGround } from './talentAvatar';

describe('talent avatar grounds', () => {
  it.each(AVATAR_GROUNDS.map((g) => [g.cls, g] as const))(
    'should clear AA for %s',
    (_cls, ground) => {
      // Arrange / Act
      const ratio = contrastRatio(ground.fg, ground.bg);

      // Assert: a monogram is text, so 4.5:1, not the 3:1 a graphic would get.
      expect(
        ratio,
        `${ground.fg} on ${ground.bg} is ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('should mix light and dark grounds', () => {
    // Arrange / Act: variety across a 200-row column comes from the split, not
    // from the count. All-dark grounds read as one colour from a distance.
    const light = AVATAR_GROUNDS.filter((g) => g.fg !== '#ffffff').length;

    // Assert
    expect(light).toBeGreaterThanOrEqual(3);
    expect(AVATAR_GROUNDS.length - light).toBeGreaterThanOrEqual(3);
  });

  it('should give a talent the same ground every time', () => {
    // Arrange
    const id = 'cmp3zaeee02t101l6cuo0605r';

    // Act / Assert
    expect(talentGround(id)).toBe(talentGround(id));
  });

  it('should spread ids across every ground', () => {
    // Arrange
    const ids = Array.from({ length: 400 }, (_, i) => `cuid${i}xyz`);

    // Act
    const used = new Set(ids.map(talentGround));

    // Assert
    expect(used.size).toBe(AVATAR_GROUNDS.length);
  });
});
