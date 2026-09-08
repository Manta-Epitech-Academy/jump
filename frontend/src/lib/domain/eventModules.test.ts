import { describe, it, expect } from 'vitest';
import {
  availableProducers,
  EVENT_MODULE_KEYS,
  landingSurface,
  reachableSurfaces,
  surfaceFromPath,
  surfaceLabel,
  surfaceSegment,
  type EventSurfaceGates,
} from './eventModules';

const gates = (over: Partial<EventSurfaceGates> = {}): EventSurfaceGates => ({
  modules: ['inscrits', 'emargement', 'bilan'],
  hasPlanning: false,
  hasFeedbackForm: true,
  hasClosingTemplate: true,
  hasDiplomaTemplate: false,
  ...over,
});

/** Everything on, so `reachableSurfaces` enumerates the whole surface set. */
const everySurface = (): EventSurfaceGates =>
  gates({ modules: EVENT_MODULE_KEYS, hasPlanning: true });

describe('landingSurface', () => {
  it('should keep the preferred surface when the event exposes it', () => {
    expect(landingSurface(gates(), 'emargement')).toBe('emargement');
  });

  it('should fall back to the first reachable surface when the preferred one is gated off by data', () => {
    // Arrange: bilan is enabled as a module but resolves no live form, and the
    // event has no schedule, so neither bilan nor planning is reachable.
    const event = gates({
      hasFeedbackForm: false,
      hasPlanning: false,
      hasClosingTemplate: false,
    });
    // Act
    const bilan = landingSurface(event, 'bilan');
    const planning = landingSurface(event, 'planning');
    // Assert
    expect(bilan).toBe('inscrits');
    expect(planning).toBe('inscrits');
  });

  it('should fall back to the first reachable surface when nothing is preferred', () => {
    expect(landingSurface(gates({ modules: ['closings'] }))).toBe('closings');
  });

  it('should return null when the event exposes nothing reachable', () => {
    expect(
      landingSurface(gates({ modules: ['bilan'], hasFeedbackForm: false })),
    ).toBeNull();
  });

  // The closings surface is gated on its module AND on the event naming a grid,
  // the same pair bilan is gated on. Without it the nav would offer a page that
  // 404s, since a grid-less closing has no questions to ask.
  it('should not reach closings when the event names no grid', () => {
    expect(
      landingSurface(
        gates({ modules: ['closings'], hasClosingTemplate: false }),
      ),
    ).toBeNull();
  });
});

describe('availableProducers', () => {
  it('should expose nothing on an event with no module', () => {
    // The common case in production: 235 events out of 292 carry no module, so
    // "produces nothing" is the shape the page has to survive, not the corner.
    expect(availableProducers(gates({ modules: [] }))).toEqual([]);
  });

  it('should expose the badges with the inscrits section alone', () => {
    expect(availableProducers(gates({ modules: ['inscrits'] }))).toEqual([
      'badges',
    ]);
  });

  it('should expose the certificates only once the event names one', () => {
    // Arrange: `Event.diplomaTemplateId` being null IS the gate - there is no
    // companion boolean anywhere, so this is the whole condition.
    const withoutTemplate = gates({ modules: ['inscrits'] });
    const withTemplate = gates({
      modules: ['inscrits'],
      hasDiplomaTemplate: true,
    });
    // Act & Assert
    expect(availableProducers(withoutTemplate)).not.toContain('diplomas');
    expect(availableProducers(withTemplate)).toContain('diplomas');
  });

  it('should expose no closing producer when the event names no grid', () => {
    // Same pair `eventRunsClosings` draws: the section alone is not enough, and
    // an event with no grid has no closing to export or to archive.
    const produced = availableProducers(
      gates({ modules: ['closings'], hasClosingTemplate: false }),
    );
    expect(produced).toEqual([]);
  });

  it('should expose no questionnaire export while its form is not live', () => {
    // A form unpublished after it was picked resolves to none on the bilan
    // surface, so offering its export here would hand out a 404.
    const produced = availableProducers(
      gates({ modules: ['bilan'], hasFeedbackForm: false }),
    );
    expect(produced).toEqual([]);
  });

  it('should order producers by the moment of the event, not by format', () => {
    const produced = availableProducers(
      gates({ modules: EVENT_MODULE_KEYS, hasDiplomaTemplate: true }),
    );
    expect(produced).toEqual([
      'badges',
      'emargement_xlsx',
      'bilan_xlsx',
      'closings_xlsx',
      'closings_pdfs',
      'diplomas',
    ]);
  });
});

describe('the exports surface', () => {
  // Its gate is DERIVED from `availableProducers` rather than configured, and a
  // derived gate is exactly what breaks quietly: written twice, the nav entry
  // and the page contents drift into an entry that opens an empty page.
  it('should be reachable exactly when the event produces something', () => {
    // Arrange
    const cases = [
      gates({ modules: [] }),
      gates({ modules: ['inscrits'] }),
      gates({ modules: ['bilan'], hasFeedbackForm: false }),
      gates({ modules: ['closings'], hasClosingTemplate: false }),
      gates({ modules: ['closings'] }),
      gates({ modules: [], hasPlanning: true }),
    ];
    // Act
    const pairs = cases.map((g) => [
      reachableSurfaces(g).includes('exports'),
      availableProducers(g).length > 0,
    ]);
    // Assert
    expect(pairs.map(([reachable]) => reachable)).toEqual(
      pairs.map(([, produces]) => produces),
    );
  });

  it('should never be the only surface an event exposes', () => {
    // Every producer requires another surface's module, so this holds by
    // construction - and it is what keeps `isNavigable` (domain/devWorkspace)
    // counting exactly the events it counted before this surface existed. A
    // producer added on a gate of its own would break it here rather than by
    // quietly making an unconfigured event look navigable.
    const flags = [true, false];
    for (const modules of [
      [],
      ['inscrits'],
      ['emargement'],
      ['bilan'],
      ['closings'],
      EVENT_MODULE_KEYS,
    ]) {
      for (const hasFeedbackForm of flags) {
        for (const hasClosingTemplate of flags) {
          for (const hasDiplomaTemplate of flags) {
            for (const hasPlanning of flags) {
              const g = gates({
                modules,
                hasFeedbackForm,
                hasClosingTemplate,
                hasDiplomaTemplate,
                hasPlanning,
              });
              const reachable = reachableSurfaces(g);
              if (!reachable.includes('exports')) continue;
              expect(
                reachable.length,
                `exports alone for ${JSON.stringify({ modules, hasFeedbackForm, hasClosingTemplate, hasDiplomaTemplate, hasPlanning })}`,
              ).toBeGreaterThanOrEqual(2);
            }
          }
        }
      }
    }
  });

  it('should never be where a context switch lands', () => {
    // `landingSurface` hands back the first reachable surface, and landing a dev
    // on the page that produces files rather than on the one that shows the
    // cohort would be wrong on every event. Being last in the order plus the
    // invariant above is what makes it impossible.
    const g = gates({ modules: EVENT_MODULE_KEYS, hasDiplomaTemplate: true });
    expect(landingSurface(g)).toBe('inscrits');
    expect(landingSurface(gates({ modules: ['closings'] }))).toBe('closings');
  });

  it('should be preserved when it IS the surface in view', () => {
    // The other half of `landingSurface`: switching event from the Exports page
    // keeps you on Exports when the target exposes it.
    const g = gates({ modules: ['inscrits'] });
    expect(landingSurface(g, 'exports')).toBe('exports');
    expect(landingSurface(gates({ modules: [] }), 'exports')).toBeNull();
  });
});

describe('surfaceSegment / surfaceLabel', () => {
  // Both read one `Record` over the surface union, so a surface added without a
  // label or a segment is a type error rather than a blank nav entry. What a type
  // cannot state is that the segment it declares is the one `surfaceFromPath`
  // reads back, which is what makes switching event from a page keep that page.
  it('should give every surface a segment that reads back as that surface', () => {
    // Arrange
    const surfaces = reachableSurfaces(everySurface());
    // Act
    const roundTripped = surfaces.map((key) =>
      surfaceFromPath(`/staff/dev/events/abc/${surfaceSegment(key)}`),
    );
    // Assert
    expect(roundTripped).toEqual(surfaces);
  });

  it('should give every surface a non-empty label', () => {
    const labels = reachableSurfaces(everySurface()).map(surfaceLabel);
    expect(labels.every((l) => l.trim().length > 0)).toBe(true);
  });
});

describe('surfaceFromPath', () => {
  it('should read the surface out of an event pathname', () => {
    expect(surfaceFromPath('/staff/dev/events/abc/inscrits')).toBe('inscrits');
    expect(surfaceFromPath('/staff/dev/events/abc/planning')).toBe('planning');
  });

  it('should read the surface out of a page nested under one', () => {
    expect(
      surfaceFromPath('/staff/dev/events/abc/emargement/contact/xyz'),
    ).toBe('emargement');
  });

  it('should read the surface under a base path', () => {
    expect(surfaceFromPath('/jump/staff/dev/events/abc/closings')).toBe(
      'closings',
    );
  });

  it('should return null off an event route', () => {
    // Arrange: the talent fiche is the load-bearing case, it is where a context
    // jump has no surface to preserve and must land on the first reachable one.
    const paths = [
      '/staff/dev/students/abc',
      '/staff/dev',
      '/staff/admin/events',
    ];
    // Act
    const surfaces = paths.map(surfaceFromPath);
    // Assert
    expect(surfaces).toEqual([null, null, null]);
  });

  it('should return null for a path segment that is not a surface', () => {
    expect(surfaceFromPath('/staff/dev/events/abc/diplomes.pdf')).toBeNull();
  });
});
