import { describe, it, expect } from 'vitest';
import {
  MASCOT_GLASSES,
  MASCOT_HAIRS,
  MASCOT_SCARVES,
} from '#lib/domain/mascot.ts';
import ATLAS from './art/epiduck.json';
import STAGE_ATLAS from './art/epiduck-stage.json';
import { DUCK } from './art/palette.ts';

// The atlas is rendered by `scripts/epiduck/build.py` and the accessories are
// a catalogue in the domain: an accessory the script never drew is a talent's
// choice that shows nothing, and nobody can report what is not there.
const worn = (catalogue: Record<string, string>, prefix: string) =>
  Object.keys(catalogue)
    .filter((key) => key !== 'none')
    .map((key) => `${prefix}.${key}`);

describe('the EpiDuck atlases', () => {
  const needed = [
    'body',
    'eyes',
    'pupils',
    'lids',
    'joy',
    ...worn(MASCOT_HAIRS, 'hair'),
    ...worn(MASCOT_GLASSES, 'glasses'),
    ...worn(MASCOT_SCARVES, 'scarf'),
  ];

  // The header's duck in both poses, and the celebration's facing the reader:
  // a stage duck missing a layer would undress him in front of everyone.
  const poses = [
    ...Object.entries(ATLAS.poses).map(([name, pose]) => ({
      name: `lane ${name}`,
      atlas: ATLAS,
      pose,
    })),
    { name: 'stage front', atlas: STAGE_ATLAS, pose: STAGE_ATLAS.poses.front },
  ];

  it.each(poses)('draws every layer a talent can choose, $name', (entry) => {
    const { atlas, pose } = entry;
    expect(Object.keys(pose.cells).sort()).toEqual([...needed].sort());
    for (const x of Object.values(pose.cells)) {
      expect(x + pose.width).toBeLessThanOrEqual(atlas.width);
    }
    expect(pose.y + pose.height).toBeLessThanOrEqual(atlas.height);
  });

  it('has a swatch colour for every scarf', () => {
    expect(Object.keys(DUCK.scarf).sort()).toEqual(
      worn(MASCOT_SCARVES, 'scarf')
        .map((layer) => layer.slice('scarf.'.length))
        .sort(),
    );
  });
});
