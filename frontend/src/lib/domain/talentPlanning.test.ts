import { describe, it, expect } from 'vitest';
import { showsSessionCard, toPlanningView } from './talentPlanning';

describe('the home’s session card', () => {
  const event = (planningSlots: unknown[]) => ({
    event: {
      publicName: 'Stage de seconde',
      date: new Date('2026-10-12T00:00:00Z'),
      startMinutes: 9 * 60,
      planningSlots,
    },
  });

  it('leads into a running event’s schedule only when it has one', () => {
    expect(showsSessionCard(toPlanningView(event([{ id: 's' }]), null))).toBe(
      true,
    );
    expect(showsSessionCard(toPlanningView(event([]), null))).toBe(false);
  });

  it('gives the next session’s date, and nothing when none is planned', () => {
    expect(showsSessionCard(toPlanningView(null, event([])))).toBe(true);
    expect(showsSessionCard(toPlanningView(null, null))).toBe(false);
  });
});
