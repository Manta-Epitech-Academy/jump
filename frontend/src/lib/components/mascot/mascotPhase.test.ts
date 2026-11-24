import { describe, it, expect } from 'vitest';
import {
  SULK_POKES,
  SULK_WINDOW_MS,
  isAsleep,
  nextPhase,
  recentPokes,
  type MascotEvent,
  type MascotPhase,
} from './mascotPhase';

const run = (from: MascotPhase, ...events: MascotEvent[]) =>
  events.reduce(nextPhase, from);

describe('nextPhase', () => {
  it('sends him to sleep and wakes him back', () => {
    const asleep = run({ phase: 'awake' }, 'sleep', 'dove');
    expect(asleep).toEqual({ phase: 'under', reason: 'sleep' });
    expect(isAsleep(asleep)).toBe(true);
    expect(run(asleep, 'wake', 'emerged')).toEqual({ phase: 'awake' });
  });

  it('keeps a sleeping duck under until the talent wakes him', () => {
    const asleep: MascotPhase = { phase: 'under', reason: 'sleep' };
    expect(run(asleep, 'surface')).toEqual(asleep);
  });

  it('ends a sulk by itself, and never on the talent’s wake', () => {
    const sulking = run({ phase: 'awake' }, 'sulk', 'dove');
    expect(isAsleep(sulking)).toBe(false);
    expect(run(sulking, 'wake')).toEqual(sulking);
    expect(run(sulking, 'surface', 'emerged')).toEqual({ phase: 'awake' });
  });

  it('turns a sulk into a sleep when the talent asks for one', () => {
    expect(run({ phase: 'under', reason: 'sulk' }, 'sleep')).toEqual({
      phase: 'under',
      reason: 'sleep',
    });
  });

  it('turns round when woken on the way down, or put back to sleep on the way up', () => {
    expect(run({ phase: 'awake' }, 'sleep', 'wake')).toEqual({
      phase: 'emerging',
    });
    expect(run({ phase: 'emerging' }, 'sleep')).toEqual({
      phase: 'diving',
      reason: 'sleep',
    });
  });

  it('ignores a poke-driven sulk while he is not on the water', () => {
    const under: MascotPhase = { phase: 'under', reason: 'sleep' };
    expect(run(under, 'sulk')).toEqual(under);
  });
});

describe('recentPokes', () => {
  it('counts only the pokes inside the window', () => {
    const now = 100_000;
    const old = now - SULK_WINDOW_MS;
    expect(recentPokes([old, now - 1], now)).toEqual([now - 1, now]);
  });

  it('reaches a sulk after enough pokes in a row', () => {
    let pokes: number[] = [];
    for (let i = 0; i < SULK_POKES; i++) pokes = recentPokes(pokes, i * 500);
    expect(pokes).toHaveLength(SULK_POKES);
  });
});
