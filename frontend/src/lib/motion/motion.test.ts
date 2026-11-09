import { describe, expect, it } from 'vitest';
import { enterParams, stagger } from './index';
import { cubicBezier } from './tokens';

describe('enterParams', () => {
  it('should fade in place, without waiting, when less motion is asked for', () => {
    // Arrange: DESIGN.md § Motion, the movement goes and the fade stays.
    const asked = { x: -12, delay: 120 };

    // Act
    const reduced = enterParams(asked, true);

    // Assert
    expect(reduced).toEqual({ x: 0, y: 0, delay: 0 });
  });

  it('should rise 12px by default and slide along x alone when x is given', () => {
    // Act
    const rise = enterParams({}, false);
    const slide = enterParams({ x: 12 }, false);

    // Assert
    expect(rise).toEqual({ x: 0, y: 12, delay: 0 });
    expect(slide).toEqual({ x: 12, y: 0, delay: 0 });
  });
});

describe('stagger', () => {
  it('should never hold the last item of a long list past 160ms', () => {
    // Act / Assert: the interest chips once waited index * 50ms, uncapped.
    expect(stagger(1)).toBe(40);
    expect(stagger(30)).toBe(160);
  });
});

describe('cubicBezier', () => {
  it('should match the CSS curve at its ends and stay within them', () => {
    // Arrange
    const ease = cubicBezier(0.2, 0, 0, 1);

    // Act
    const samples = Array.from({ length: 11 }, (_, i) => ease(i / 10));

    // Assert
    expect(samples[0]).toBe(0);
    expect(samples[10]).toBe(1);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
    }
    // An ease-out: well past half the distance at half the time.
    expect(samples[5]).toBeGreaterThan(0.8);
  });
});
