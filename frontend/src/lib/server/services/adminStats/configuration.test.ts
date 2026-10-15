import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdminEventVM } from '$lib/server/services/events';

const listAdminEvents = vi.fn();
vi.mock('$lib/server/services/events', () => ({
  EventService: { listAdminEvents: () => listAdminEvents() },
}));

const campusFindMany = vi.fn();
const staffGroupBy = vi.fn();
vi.mock('$lib/server/db', () => ({
  prisma: {
    campus: { findMany: (args: unknown) => campusFindMany(args) },
    staffProfile: { groupBy: (args: unknown) => staffGroupBy(args) },
  },
}));

const { getCampusOverview } = await import('./configuration');

function event(over: Partial<AdminEventVM> = {}): AdminEventVM {
  return {
    id: 'evt',
    campusId: 'campus_lille',
    campusName: 'Lille',
    schoolYearLabel: '2025-2026',
    status: 'upcoming',
    configState: 'shown',
    modules: ['inscrits'],
    participations: 10,
    ...over,
  } as AdminEventVM;
}

beforeEach(() => {
  listAdminEvents.mockReset();
  campusFindMany.mockReset().mockResolvedValue([
    { id: 'campus_lille', name: 'Lille' },
    { id: 'campus_nantes', name: 'Nantes' },
    { id: 'campus_paris', name: 'Paris' },
  ]);
  staffGroupBy
    .mockReset()
    .mockResolvedValue([
      { campusId: 'campus_lille', staffRole: 'dev', _count: { _all: 3 } },
    ]);
});

describe('getCampusOverview', () => {
  // One answer to "where do the events stand", where there used to be two with
  // different rows: the totals and the section tally over the whole périmètre,
  // and the same counts per campus beside the team.
  it('gives the totals and every campus, counted the same way', async () => {
    listAdminEvents.mockResolvedValue([
      event({ id: 'a', configState: 'shown', participations: 10 }),
      event({ id: 'b', configState: 'ready', participations: 5 }),
      event({
        id: 'c',
        campusId: 'campus_nantes',
        campusName: 'Nantes',
        configState: 'unconfigured',
        modules: [],
        participations: 30,
      }),
    ]);

    const overview = await getCampusOverview();

    expect(overview.totals.events.value).toBe(3);
    expect(overview.totals.visible.value).toBe(1);
    expect(overview.totals.participants.value).toBe(45);
    expect(overview.perModule.value).toEqual([
      { module: 'inscrits', label: expect.any(String), events: 2 },
    ]);
    expect(overview.campuses.value.map((row) => row.campus)).toEqual([
      'Lille',
      'Nantes',
      'Paris',
    ]);
    expect(overview.campuses.value[0]).toMatchObject({
      events: 2,
      visible: 1,
      visibleShare: 50,
      readyToPublish: 1,
      unconfigured: 0,
      toPrepare: 1,
      participants: 15,
      staff: [{ role: 'dev', count: 3 }],
      modules: [{ module: 'inscrits', events: 2 }],
    });
  });

  // A campus that ran nothing in scope is a row, not an absence: it is the
  // commoner case on a narrowed périmètre, and the one somebody needs to see.
  it('keeps a campus with no event in scope as a row of zeros', async () => {
    listAdminEvents.mockResolvedValue([event()]);

    const overview = await getCampusOverview();

    expect(overview.campuses.value.at(-1)).toMatchObject({
      campus: 'Paris',
      events: 0,
      visibleShare: null,
      staff: [],
      modules: [],
    });
  });
});
