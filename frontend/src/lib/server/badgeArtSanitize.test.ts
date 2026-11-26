/**
 * The wall in front of a badge's drawing (#551). It is drawn straight into a
 * talent's page, so unlike a certificate's design there is no sandboxed
 * renderer behind this screen: what it lets through runs where a minor reads.
 */

import { describe, it, expect } from 'vitest';
import { BADGE_ART_MAX } from '#lib/domain/badges.ts';
import { BADGE_ART } from '../../../scripts/seed/catalog/badgeArt';
import { screenBadgeArt } from './badgeArtSanitize';

const DISC =
  '<circle cx="40" cy="40" r="36" fill="#013AFB" stroke="#FFFFFF" stroke-width="5"></circle>';

function problemsOf(art: string): string {
  return screenBadgeArt(art).problems.join(' ');
}

describe('what a drawing keeps', () => {
  // The seed's drawings are the mockup's stickers, so they are what the PO
  // asked for: any of them altered on the way in would be a sticker the
  // collection no longer draws as designed.
  it.each(Object.entries(BADGE_ART))('keeps %s byte for byte', (_key, art) => {
    expect(screenBadgeArt(art)).toEqual({ art, problems: [] });
  });
});

describe('what a drawing refuses, naming it', () => {
  it.each([
    ['a script', `${DISC}<script>alert(1)</script>`, '<script>'],
    [
      'an event handler',
      '<circle r="3" onclick="alert(1)"></circle>',
      'onclick',
    ],
    [
      'HTML smuggled in',
      `${DISC}<foreignObject><p>x</p></foreignObject>`,
      '<foreignobject>',
    ],
    [
      'an image',
      `${DISC}<image href="https://x.test/a.png"></image>`,
      '<image>',
    ],
    ['a link', `<a href="https://x.test">${DISC}</a>`, '<a>'],
    ['a style attribute', '<circle r="3" style="fill:red"></circle>', 'style'],
    ['an id', '<circle id="c" r="3"></circle>', 'id'],
    ['a reference', '<circle r="3" fill="url(#g)"></circle>', 'fill'],
    [
      'a face the page does not load',
      '<text font-family="Comic Sans MS">A</text>',
      'font-family',
    ],
    [
      'an animation',
      `${DISC}<animate attributeName="r"></animate>`,
      '<animate>',
    ],
  ])('refuses %s', (_name, art, named) => {
    expect(problemsOf(art)).toContain(named);
  });

  // Closing the frame is how a drawing would leave the SVG context and write
  // HTML into the page around it.
  it('refuses a drawing that closes its frame', () => {
    expect(problemsOf(`${DISC}</svg><img src=x onerror="alert(1)">`)).not.toBe(
      '',
    );
    expect(problemsOf(`${DISC}</svg>texte`)).toContain('</svg>');
  });

  it('refuses a frame inside the frame, and a drawing of nothing', () => {
    expect(problemsOf(`<svg>${DISC}</svg>`)).toContain('<svg>');
    expect(problemsOf('du texte seul')).toContain('au moins une forme');
  });

  it('refuses a drawing over the ceiling, before parsing it', () => {
    expect(problemsOf(DISC.repeat(BADGE_ART_MAX / DISC.length + 1))).toContain(
      String(BADGE_ART_MAX),
    );
  });
});
