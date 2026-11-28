import { describe, it, expect } from 'vitest';
import {
  isAsleep,
  nextPhase,
  type MascotEvent,
  type MascotPhase,
} from './mascotPhase';

const run = (from: MascotPhase, ...events: MascotEvent[]) =>
  events.reduce(nextPhase, from);

describe('nextPhase', () => {
  it('sends him to sleep and wakes him back', () => {
    const asleep = run('awake', 'sleep', 'dove');
    expect(asleep).toBe('under');
    expect(isAsleep(asleep)).toBe(true);
    expect(run(asleep, 'wake', 'emerged')).toBe('awake');
  });

  it('turns round when the talent changes their mind mid-way', () => {
    expect(run('awake', 'sleep', 'wake')).toBe('emerging');
    expect(run('emerging', 'sleep')).toBe('diving');
  });

  it('is asleep only under the water or on the way down', () => {
    expect(
      (['awake', 'diving', 'under', 'emerging'] as const).filter(isAsleep),
    ).toEqual(['diving', 'under']);
  });
});
