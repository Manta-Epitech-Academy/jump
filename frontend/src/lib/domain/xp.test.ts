import { describe, it, expect } from 'vitest';
import { WORKSHOP_XP_PER_MINUTE, workshopXp } from './xp';
import { workshopGrantSourceId, workshopSlugFromSourceId } from './workshops';

/**
 * The activity scale, which is the one number the PO stated and the one place it
 * can quietly stop being true.
 *
 * Two properties carry the whole feature. A finished activity is worth exactly
 * what it was declared to be worth, which is why it is computed as ONE rounded
 * term over the whole activity rather than one per step. And a talent's scale is
 * the budget snapshotted on their participation, so re-declaring a duration moves
 * nobody who has already started.
 */
describe('the activity XP scale', () => {
  it('pays a finished activity exactly its declared minutes', () => {
    expect(workshopXp(15, 15, 120)).toBe(120 * WORKSHOP_XP_PER_MINUTE);
    expect(workshopXp(12, 12, 90)).toBe(90 * WORKSHOP_XP_PER_MINUTE);
  });

  it('pays a partial walk in proportion to the steps validated', () => {
    // Half of a two-hour activity is half of 1200.
    expect(workshopXp(6, 12, 120)).toBe(600);
    // A third of it, rounded once over the whole activity rather than per step.
    expect(workshopXp(5, 15, 120)).toBe(400);
  });

  it('pays nothing for an activity that counts no step', () => {
    // CTFd claims the totals, so a subject reporting none is a claim to survive
    // rather than an impossible state: no denominator, no XP, no division by zero.
    expect(workshopXp(0, 0, 120)).toBe(0);
    expect(workshopXp(3, 0, 120)).toBe(0);
  });

  it('pays nothing before the first step is validated', () => {
    expect(workshopXp(0, 15, 120)).toBe(0);
  });

  it('never pays above the declared minutes, whatever CTFd reports', () => {
    // A subject that drops a step somebody had already validated reports more
    // solved than exist. Unclamped, that term pays 1286 XP on an activity
    // declared at two hours, which is above the ceiling this scale IS.
    expect(workshopXp(15, 14, 120)).toBe(120 * WORKSHOP_XP_PER_MINUTE);
    expect(workshopXp(99, 15, 120)).toBe(120 * WORKSHOP_XP_PER_MINUTE);
  });

  it('rounds once over the activity, so the steps always sum to the budget', () => {
    // Seven steps of a two-hour activity: 1200 / 7 does not divide, so a grant
    // per step would round seven times and miss the budget. Walked whole, this
    // still pays 1200 to the XP.
    const perStep = [1, 2, 3, 4, 5, 6, 7].map((solved) =>
      workshopXp(solved, 7, 120),
    );
    expect(perStep.at(-1)).toBe(1200);
    expect(perStep).toEqual([171, 343, 514, 686, 857, 1029, 1200]);
  });

  it('keeps a talent on the budget snapshotted at their first entry', () => {
    // The admin re-declares the activity at three hours. A talent who entered
    // while it was two hours keeps the two-hour scale, because the callback reads
    // the budget off their participation and never off the event configuration.
    const snapshotted = 120;
    const reDeclared = 180;
    expect(workshopXp(15, 15, snapshotted)).toBe(1200);
    expect(workshopXp(15, 15, reDeclared)).toBe(1800);
    expect(workshopXp(15, 15, snapshotted)).not.toBe(
      workshopXp(15, 15, reDeclared),
    );
  });
});

describe('the activity grant id', () => {
  it('reads the instance slug back out of what it composed', () => {
    const sourceId = workshopGrantSourceId('pacman-ia', 'sd_tal_paris_0001');
    expect(sourceId).toBe('pacman-ia:sd_tal_paris_0001');
    expect(workshopSlugFromSourceId(sourceId)).toBe('pacman-ia');
  });

  it('answers null for anything it did not compose', () => {
    // A `reward` grant's sourceId reaching this parser must not produce a slug
    // the timeline would then fail to resolve into a label.
    expect(workshopSlugFromSourceId(null)).toBeNull();
    expect(workshopSlugFromSourceId('')).toBeNull();
  });
});
