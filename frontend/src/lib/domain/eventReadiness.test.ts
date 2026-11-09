/**
 * The two configuration rules an event is read by, and the one place they now
 * live.
 *
 * Worth pinning rather than eyeballing because both were duplicated before this,
 * and the duplication was invisible: `missing` was written character for
 * character in two aggregates a reader compares side by side, and the activation
 * rule existed as a Prisma `where`, as a hand-copied predicate, and as a French
 * sentence that listed all three causes with "or" because it could not tell which
 * one applied.
 */

import { describe, it, expect } from 'vitest';
import {
  activationBlockers,
  canBeMadeVisible,
  eventMissingConfig,
  EVENT_MISSING_LABELS,
  preparationHorizon,
  type EventConfigFields,
} from './eventReadiness';

const configured: EventConfigFields = {
  publicName: 'Stage Web Été 2026',
  cohortNoun: 'stagiaire',
  modules: ['inscrits'],
  devActivated: true,
};

describe('eventMissingConfig', () => {
  it('is empty on a fully configured, activated event', () => {
    expect(eventMissingConfig(configured)).toEqual([]);
  });

  it('lists every unset field, in the order a human would fix them', () => {
    expect(
      eventMissingConfig({
        publicName: '',
        cohortNoun: null,
        modules: [],
        devActivated: false,
      }),
    ).toEqual([
      EVENT_MISSING_LABELS.publicName,
      EVENT_MISSING_LABELS.cohortNoun,
      EVENT_MISSING_LABELS.modules,
    ]);
  });

  // "No section" and "not activated yet" are one rung, not two: an event with no
  // section shows nothing whatever the gate says, so naming both would send the
  // reader to flip a switch that changes nothing.
  it('asks for the activation only once a section exists', () => {
    expect(
      eventMissingConfig({ ...configured, modules: [], devActivated: false }),
    ).toEqual([EVENT_MISSING_LABELS.modules]);
    expect(eventMissingConfig({ ...configured, devActivated: false })).toEqual([
      EVENT_MISSING_LABELS.activation,
    ]);
  });
});

describe('activationBlockers', () => {
  it('is empty when activating would actually show something', () => {
    expect(activationBlockers({ ...configured, devActivated: false })).toEqual(
      [],
    );
    expect(canBeMadeVisible({ ...configured, devActivated: false })).toBe(true);
  });

  it('names what this event lacks, not every possibility', () => {
    expect(activationBlockers({ ...configured, publicName: null })).toEqual([
      EVENT_MISSING_LABELS.publicName,
    ]);
  });

  // The gap this closes: `configState` calls such an event `ready` ("Prêt à
  // publier", one toggle from live) while the activation write refuses it.
  it('refuses an event with sections but no public name, which reads as ready', () => {
    expect(canBeMadeVisible({ ...configured, publicName: '' })).toBe(false);
  });

  // The write does not check the cohort noun, so listing it here would refuse an
  // activation that in fact succeeds.
  it('ignores the cohort noun, which blocks nothing', () => {
    const noNoun = { ...configured, cohortNoun: null };
    expect(eventMissingConfig(noNoun)).toContain(
      EVENT_MISSING_LABELS.cohortNoun,
    );
    expect(activationBlockers(noNoun)).toEqual([]);
  });
});

// The weekly digest leads with the imminent band, so an event filed one band
// too late is one nobody prepares in time.
describe('preparationHorizon', () => {
  const today = '2026-11-09';

  it('counts calendar days, the seventh still this week and the twenty-first still soon', () => {
    expect(preparationHorizon('upcoming', '2026-11-16', today)).toBe(
      'imminent',
    );
    expect(preparationHorizon('upcoming', '2026-11-17', today)).toBe('soon');
    expect(preparationHorizon('upcoming', '2026-11-30', today)).toBe('soon');
    expect(preparationHorizon('upcoming', '2026-12-01', today)).toBe('later');
  });

  it('holds across a month and a year end', () => {
    expect(preparationHorizon('upcoming', '2027-01-04', '2026-12-28')).toBe(
      'imminent',
    );
  });

  it('treats an event under way as imminent and a finished one as having no horizon', () => {
    expect(preparationHorizon('ongoing', '2026-11-02', today)).toBe('imminent');
    expect(preparationHorizon('past', '2026-11-02', today)).toBeNull();
  });
});
