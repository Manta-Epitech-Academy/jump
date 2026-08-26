/**
 * The events directory, whose reason to exist is an address rather than a figure:
 * before it, the id of an event that was visible and had not happened yet was
 * returned by no read at all.
 *
 * So what is worth pinning is the filtering (a state filter that answers with the
 * wrong bucket is worse than none), the cap, and the tier split - a leadership row
 * carrying configuration state would hand a steering credential a screen it has no
 * business reading.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdminEventVM } from '$lib/server/services/events';

const listAdminEvents = vi.fn();
vi.mock('$lib/server/services/events', () => ({
  EventService: { listAdminEvents: () => listAdminEvents() },
}));

const { getEventsConfigList, getEventsDirectory, EVENTS_LIST_LIMIT } =
  await import('./eventsList');

/** Minimal AdminEventVM: only the fields either projection reads carry meaning. */
function event(over: Partial<AdminEventVM> = {}): AdminEventVM {
  return {
    id: 'evt',
    titre: 'Lille-12-02-2026-CodingClub',
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
    endDate: '2026-02-26',
    modules: ['inscrits'],
    moduleSettings: {},
    feedbackFormId: '',
    participations: 10,
    ...over,
  } as AdminEventVM;
}

beforeEach(() => listAdminEvents.mockReset());

describe('getEventsConfigList', () => {
  // The whole point: this state was reachable through no read before.
  it('returns the id of an event that is already visible and not yet past', async () => {
    listAdminEvents.mockResolvedValue([
      event({ id: 'live', configState: 'shown', status: 'ongoing' }),
    ]);

    const answer = await getEventsConfigList({}, { state: 'shown' });

    expect(answer.list.value.map((row) => row.eventId)).toEqual(['live']);
  });

  it('filters on the configuration state', async () => {
    listAdminEvents.mockResolvedValue([
      event({ id: 'a', configState: 'shown' }),
      event({ id: 'b', configState: 'ready', devActivated: false }),
      event({ id: 'c', configState: 'unconfigured', modules: [] }),
    ]);

    const ready = await getEventsConfigList({}, { state: 'ready' });

    expect(ready.list.value.map((row) => row.eventId)).toEqual(['b']);
    expect(ready.events.value).toBe(1);
  });

  // `to_prepare` is not a configuration state: it folds in the calendar, because
  // an event that is over needs nothing whatever its config says.
  it('treats to_prepare as the readiness bucket, so a past event never qualifies', async () => {
    listAdminEvents.mockResolvedValue([
      event({ id: 'todo', configState: 'ready', status: 'upcoming' }),
      event({ id: 'over', configState: 'ready', status: 'past' }),
    ]);

    const answer = await getEventsConfigList({}, { state: 'to_prepare' });

    expect(answer.list.value.map((row) => row.eventId)).toEqual(['todo']);
  });

  it('filters on the point of life', async () => {
    listAdminEvents.mockResolvedValue([
      event({ id: 'now', status: 'ongoing' }),
      event({ id: 'later', status: 'upcoming' }),
    ]);

    const answer = await getEventsConfigList({}, { status: 'ongoing' });

    expect(answer.list.value.map((row) => row.eventId)).toEqual(['now']);
  });

  // Two lists a reader compares: what is unset, and what actually blocks. A
  // missing cohort noun belongs to the first and to neither of the second.
  it('separates what is unset from what blocks the activation', async () => {
    listAdminEvents.mockResolvedValue([
      event({ cohortNoun: null, devActivated: false, configState: 'ready' }),
    ]);

    const [row] = (await getEventsConfigList()).list.value;

    expect(row.missing).toContain('nom des participants');
    expect(row.activationBlockers).toEqual([]);
  });

  it('reports the total and flags the cap without silently shortening it', async () => {
    listAdminEvents.mockResolvedValue(
      Array.from({ length: EVENTS_LIST_LIMIT + 3 }, (_, i) =>
        event({ id: `e${i}` }),
      ),
    );

    const answer = await getEventsConfigList();

    expect(answer.events.value).toBe(EVENTS_LIST_LIMIT + 3);
    expect(answer.list.value).toHaveLength(EVENTS_LIST_LIMIT);
    expect(answer.truncated).toBe(true);
  });
});

describe('getEventsDirectory', () => {
  it('carries the identity a steering answer needs', async () => {
    listAdminEvents.mockResolvedValue([
      event({ id: 'evt', participations: 42 }),
    ]);

    const [row] = (await getEventsDirectory()).list.value;

    expect(row).toEqual({
      eventId: 'evt',
      event: 'Coding Club',
      campus: 'Lille',
      dateLabel: '12 fév. 2026',
      schoolYear: '2025-2026',
      status: 'upcoming',
      participants: 42,
    });
  });

  // The tier split is the reason there are two projections rather than one
  // operation answering differently depending on who asked.
  it('carries no configuration state and no Salesforce name', async () => {
    listAdminEvents.mockResolvedValue([event()]);

    const [row] = (await getEventsDirectory()).list.value;

    expect(row).not.toHaveProperty('configState');
    expect(row).not.toHaveProperty('missing');
    expect(row).not.toHaveProperty('activationBlockers');
    expect(row).not.toHaveProperty('salesforceName');
    expect(row).not.toHaveProperty('modules');
  });
});
