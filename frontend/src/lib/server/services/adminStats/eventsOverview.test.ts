import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdminEventVM } from '$lib/server/services/events';
import { VISIBLE_PARTICIPATION_DEFINITION } from '$lib/domain/sfMemberStatus';

const listAdminEvents = vi.fn();
vi.mock('$lib/server/services/events', () => ({
  EventService: { listAdminEvents: () => listAdminEvents() },
}));

const { getEventsOverview } = await import('./eventsOverview');

/** Minimal AdminEventVM: only the fields the overview reads carry meaning. */
function event(over: Partial<AdminEventVM> = {}): AdminEventVM {
  return {
    id: 'evt',
    titre: 'Lille-CodingClub',
    publicName: 'Coding Club',
    displayName: 'Coding Club',
    cohortNoun: 'participant',
    campusId: 'campus_lille',
    campusName: 'Lille',
    dateLabel: '12 fév. 2026',
    dateTs: 0,
    createdTs: 0,
    startDateKey: '2026-02-12',
    schoolYearLabel: '2025-2026',
    schoolYearStart: 2025,
    startTime: '',
    status: 'upcoming',
    synced: true,
    devActivated: true,
    configState: 'shown',
    endDate: '',
    modules: ['inscrits'],
    moduleSettings: {},
    feedbackFormId: '',
    participations: 10,
    ...over,
  } as AdminEventVM;
}

beforeEach(() => listAdminEvents.mockReset());

describe('getEventsOverview', () => {
  it('counts each configuration state and sums participations on the visible cohort', async () => {
    listAdminEvents.mockResolvedValue([
      event({ id: 'a', configState: 'shown', participations: 100 }),
      event({ id: 'b', configState: 'ready', participations: 20 }),
      event({ id: 'c', configState: 'unconfigured', participations: 5 }),
    ]);

    const overview = await getEventsOverview();

    expect(overview.totals.events.value).toBe(3);
    expect(overview.totals.visible.value).toBe(1);
    expect(overview.totals.readyToPublish.value).toBe(1);
    expect(overview.totals.unconfigured.value).toBe(1);
    expect(overview.totals.participants.value).toBe(125);
  });

  it('counts as "to prepare" only non-past events that are not yet visible', async () => {
    listAdminEvents.mockResolvedValue([
      event({
        id: 'past-unconfigured',
        status: 'past',
        configState: 'unconfigured',
      }),
      event({ id: 'upcoming-ready', status: 'upcoming', configState: 'ready' }),
      event({ id: 'upcoming-shown', status: 'upcoming', configState: 'shown' }),
    ]);

    const overview = await getEventsOverview();

    expect(overview.totals.toPrepare.value).toBe(1);
  });

  it('filters by school year and by campus, leaving available years computed on everything', async () => {
    listAdminEvents.mockResolvedValue([
      event({
        id: 'a',
        schoolYearLabel: '2025-2026',
        campusId: 'campus_lille',
      }),
      event({
        id: 'b',
        schoolYearLabel: '2026-2027',
        campusId: 'campus_lille',
      }),
      event({
        id: 'c',
        schoolYearLabel: '2026-2027',
        campusId: 'campus_nantes',
        campusName: 'Nantes',
      }),
    ]);

    const overview = await getEventsOverview({
      schoolYear: '2026-2027',
      campus: { id: 'campus_nantes', name: 'Nantes' },
    });

    expect(overview.totals.events.value).toBe(1);
    expect(overview.filters.campus).toBe('Nantes');
    // Newest first, and computed before filtering so a caller can re-ask.
    expect(overview.availableSchoolYears.value).toEqual([
      '2026-2027',
      '2025-2026',
    ]);
  });

  // A campus that exists but has no event in scope is a truthful zero, reported
  // under its own name. What must never happen again is the previous behaviour,
  // where an unresolved `campusId` was echoed back verbatim as if it were one.
  it('reports a resolved campus with no events as a named zero', async () => {
    listAdminEvents.mockResolvedValue([event({ campusId: 'campus_lille' })]);

    const overview = await getEventsOverview({
      campus: { id: 'campus_paris', name: 'Paris' },
    });

    expect(overview.filters.campus).toBe('Paris');
    expect(overview.totals.events.value).toBe(0);
  });

  it('refuses a school year no event falls in, rather than reporting zeros', async () => {
    listAdminEvents.mockResolvedValue([
      event({ schoolYearLabel: '2025-2026' }),
    ]);

    await expect(
      getEventsOverview({ schoolYear: '2099-2100' }),
    ).rejects.toThrow('2025-2026');
  });

  it('rolls up per campus, busiest first', async () => {
    listAdminEvents.mockResolvedValue([
      event({ id: 'a', campusName: 'Lille', participations: 10 }),
      event({ id: 'b', campusName: 'Lille', participations: 5 }),
      event({
        id: 'c',
        campusName: 'Nantes',
        campusId: 'campus_nantes',
        participations: 30,
      }),
    ]);

    const overview = await getEventsOverview();

    expect(overview.perCampus.value).toEqual([
      {
        campus: 'Lille',
        events: 2,
        visible: 2,
        visibleShare: 100,
        readyToPublish: 0,
        unconfigured: 0,
        participants: 15,
      },
      {
        campus: 'Nantes',
        events: 1,
        visible: 1,
        visibleShare: 100,
        readyToPublish: 0,
        unconfigured: 0,
        participants: 30,
      },
    ]);
  });

  it('counts module adoption across events', async () => {
    listAdminEvents.mockResolvedValue([
      event({ id: 'a', modules: ['inscrits', 'emargement'] }),
      event({ id: 'b', modules: ['inscrits'] }),
    ]);

    const overview = await getEventsOverview();

    expect(overview.perModule.value[0]).toMatchObject({
      module: 'inscrits',
      events: 2,
    });
    expect(
      overview.perModule.value.find((m) => m.module === 'emargement')?.events,
    ).toBe(1);
  });

  // The clause is owned by the module that owns the filter it describes. Two
  // aggregates used to spell it out by hand, and both said "READY ou MEET" while
  // the filter also keeps legacy statusless rows.
  it('states the visible-cohort rule from its single owner, not a local copy', async () => {
    listAdminEvents.mockResolvedValue([event()]);

    const overview = await getEventsOverview();

    expect(overview.totals.participants.definition).toContain(
      VISIBLE_PARTICIPATION_DEFINITION,
    );
    expect(overview.perCampus.definition).toContain(
      VISIBLE_PARTICIPATION_DEFINITION,
    );
  });

  it('ships a definition with every figure, so a consumer never has to guess what it counts', async () => {
    listAdminEvents.mockResolvedValue([event()]);

    const overview = await getEventsOverview();

    for (const value of Object.values(overview.totals)) {
      expect(value.definition.length).toBeGreaterThan(20);
    }
    expect(overview.perCampus.definition).toBeTruthy();
    expect(overview.perModule.definition).toBeTruthy();
  });
});
