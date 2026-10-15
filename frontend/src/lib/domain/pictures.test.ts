import { describe, it, expect } from 'vitest';
import { reducedMotionUrl, type ShownPicture } from './pictures';

const picture = (
  url: string,
  stillUrl: string | null = null,
): ShownPicture => ({
  url,
  width: 1280,
  height: 720,
  stillUrl,
});

describe('reducedMotionUrl', () => {
  const visual = picture('/visual.gif', '/visual-still.webp');

  it('shows the first frame of an animation, or the still its author chose', () => {
    expect(reducedMotionUrl(visual)).toBe('/visual-still.webp');
    expect(reducedMotionUrl(visual, picture('/poster.webp'))).toBe(
      '/poster.webp',
    );
  });

  // A poster is taken as a GIF too: trusting it to hold still showed the
  // animation to the very talents who asked for none.
  it('never hands an animated poster to a talent who asked for no motion', () => {
    const poster = picture('/poster.gif', '/poster-still.webp');
    expect(reducedMotionUrl(visual, poster)).toBe('/poster-still.webp');
    expect(reducedMotionUrl(poster, poster)).toBe('/poster-still.webp');
  });

  it('changes nothing for a picture that already holds still', () => {
    const still = picture('/poster.webp');
    expect(reducedMotionUrl(still)).toBeNull();
    expect(reducedMotionUrl(still, still)).toBeNull();
  });
});
