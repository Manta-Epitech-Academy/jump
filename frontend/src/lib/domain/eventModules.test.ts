import { describe, it, expect } from 'vitest';
import {
  eventSurfacePath,
  landingSurface,
  reachableSurfaces,
  surfaceFromPath,
  type EventSurfaceGates,
} from './eventModules';

const gates = (over: Partial<EventSurfaceGates> = {}): EventSurfaceGates => ({
  modules: ['inscrits', 'emargement', 'bilan'],
  hasPlanning: false,
  hasFeedbackForm: true,
  hasClosingTemplate: true,
  ...over,
});

describe('landingSurface', () => {
  it('should keep the preferred surface when the event exposes it', () => {
    expect(landingSurface(gates(), 'emargement')).toBe('emargement');
  });

  it('should open on the home when nothing is preferred', () => {
    expect(landingSurface(gates({ modules: ['closings'] }))).toBe('home');
  });

  it('should fall back to the home when the preferred surface is gated off by data', () => {
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
    expect(bilan).toBe('home');
    expect(planning).toBe('home');
  });

  it('should still open an event whose every section is gated off', () => {
    expect(
      landingSurface(gates({ modules: ['bilan'], hasFeedbackForm: false })),
    ).toBe('home');
  });
});

describe('reachableSurfaces', () => {
  it('should lead with the home, whatever the event turns on', () => {
    expect(reachableSurfaces(gates({ modules: [] }))).toEqual(['home']);
    expect(reachableSurfaces(gates())[0]).toBe('home');
  });

  // The closings surface is gated on its module AND on the event naming a grid,
  // the same pair bilan is gated on. Without it the nav would offer a page that
  // 404s, since a grid-less closing has no questions to ask.
  it('should not reach closings when the event names no grid', () => {
    expect(
      reachableSurfaces(
        gates({ modules: ['closings'], hasClosingTemplate: false }),
      ),
    ).not.toContain('closings');
  });
});

describe('eventSurfacePath', () => {
  it('should put the home at the event address and the rest below it', () => {
    expect(eventSurfacePath('abc', 'home')).toBe('/staff/dev/events/abc');
    expect(eventSurfacePath('abc', 'bilan')).toBe(
      '/staff/dev/events/abc/bilan',
    );
  });

  it('should read back every surface it writes', () => {
    for (const key of reachableSurfaces(
      gates({
        hasPlanning: true,
        modules: ['inscrits', 'emargement', 'bilan', 'closings'],
      }),
    ))
      expect(surfaceFromPath(eventSurfacePath('abc', key))).toBe(key);
  });
});

describe('surfaceFromPath', () => {
  it('should read the surface out of an event pathname', () => {
    expect(surfaceFromPath('/staff/dev/events/abc/inscrits')).toBe('inscrits');
    expect(surfaceFromPath('/staff/dev/events/abc/planning')).toBe('planning');
  });

  it("should read the event's own address as its home", () => {
    expect(surfaceFromPath('/staff/dev/events/abc')).toBe('home');
    expect(surfaceFromPath('/staff/dev/events/abc/')).toBe('home');
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
    // jump has no surface to preserve and must land on the event's home.
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
