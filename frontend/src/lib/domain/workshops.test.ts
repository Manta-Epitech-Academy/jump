import { describe, it, expect } from 'vitest';
import type { EventLifecycleStatus } from './eventLifecycle';
import {
  activitiesToDo,
  selectWorkshopOfferings,
  type WorkshopActivity,
} from './workshops';

const offering = (
  activityId: string,
  day: string,
  status: EventLifecycleStatus,
  position = 0,
  eventId = `${activityId}@${day}`,
) => ({
  activityId,
  eventDate: new Date(`${day}T00:00:00Z`),
  status,
  position,
  eventId,
});

const none = new Set<string>();

describe('selectWorkshopOfferings', () => {
  it('offers nothing before the event has started', () => {
    expect(
      selectWorkshopOfferings(
        [offering('pacman', '2026-10-28', 'upcoming')],
        none,
      ),
    ).toEqual([]);
  });

  it('offers it from the first day, as today, and for good afterwards', () => {
    const [today] = selectWorkshopOfferings(
      [offering('pacman', '2026-10-28', 'ongoing')],
      none,
    );
    expect(today).toMatchObject({ activityId: 'pacman', today: true });

    const [later] = selectWorkshopOfferings(
      [offering('pacman', '2026-10-28', 'past')],
      none,
    );
    expect(later).toMatchObject({ activityId: 'pacman', today: false });
  });

  it('keeps what a talent already started, even if only a future event offers it', () => {
    const [kept] = selectWorkshopOfferings(
      [offering('pacman', '2026-12-02', 'upcoming')],
      new Set(['pacman']),
    );
    expect(kept).toMatchObject({ activityId: 'pacman', today: false });
  });

  it('prefers an event that has run over a future one, for a talent already on it', () => {
    const rows = [
      offering('pacman', '2026-09-16', 'past'),
      offering('pacman', '2026-10-10', 'upcoming'),
    ];
    expect(selectWorkshopOfferings(rows, new Set(['pacman']))).toEqual([
      expect.objectContaining({ eventId: 'pacman@2026-09-16' }),
    ]);
  });

  it('resolves an activity offered twice to today, then to the most recent', () => {
    const rows = [
      offering('pacman', '2026-03-11', 'past'),
      offering('pacman', '2026-10-28', 'ongoing'),
      offering('pacman', '2026-12-02', 'upcoming'),
    ];
    expect(selectWorkshopOfferings(rows, none)).toEqual([
      expect.objectContaining({ eventId: 'pacman@2026-10-28', today: true }),
    ]);
    expect(
      selectWorkshopOfferings(
        [
          offering('pacman', '2026-03-11', 'past'),
          offering('pacman', '2026-05-06', 'past'),
        ],
        none,
      ),
    ).toEqual([expect.objectContaining({ eventId: 'pacman@2026-05-06' })]);
  });

  it('lists the newest event first, then in the event’s own order', () => {
    const rows = [
      offering('linux', '2026-03-11', 'past', 0),
      offering('pacman', '2026-10-28', 'ongoing', 1, 'camp'),
      offering('santa', '2026-10-28', 'ongoing', 0, 'camp'),
    ];
    expect(
      selectWorkshopOfferings(rows, none).map((o) => o.activityId),
    ).toEqual(['santa', 'pacman', 'linux']);
  });

  // Two events of the same day, both offering one subject: whichever is chosen
  // pins the minute budget on a first entry, so it cannot depend on the order
  // the database happened to return the enrolments in.
  it('resolves a tie between two events of the same day the same way every time', () => {
    const club = offering('pacman', '2026-10-28', 'ongoing', 0, 'evt-b');
    const camp = offering('pacman', '2026-10-28', 'ongoing', 0, 'evt-a');
    for (const rows of [
      [club, camp],
      [camp, club],
    ]) {
      expect(selectWorkshopOfferings(rows, none)).toEqual([
        expect.objectContaining({ eventId: 'evt-a' }),
      ]);
    }
  });

  it('keeps two events of the same day apart, in the same order every time', () => {
    const rows = [
      offering('santa', '2026-10-28', 'ongoing', 0, 'evt-b'),
      offering('linux', '2026-10-28', 'ongoing', 1, 'evt-a'),
      offering('pacman', '2026-10-28', 'ongoing', 0, 'evt-a'),
    ];
    const expected = ['pacman', 'linux', 'santa'];
    expect(
      selectWorkshopOfferings(rows, none).map((o) => o.activityId),
    ).toEqual(expected);
    expect(
      selectWorkshopOfferings([...rows].reverse(), none).map(
        (o) => o.activityId,
      ),
    ).toEqual(expected);
  });
});

describe('activitiesToDo', () => {
  const activity = (
    slug: string,
    solved: number,
    total: number,
    startedAt: string | null = null,
  ): WorkshopActivity => ({
    slug,
    label: slug,
    solvedSteps: solved,
    totalSteps: total,
    startedAt: startedAt ? new Date(startedAt) : null,
    cover: { tagline: null, media: null, poster: null, mascot: null },
  });
  const snake = activity('snake', 0, 0);
  const pacman = activity('pacman', 3, 10, '2026-10-01T10:00:00Z');
  const linux = activity('linux', 12, 12, '2026-10-02T10:00:00Z');
  const docker = activity('docker', 1, 8, '2026-10-03T10:00:00Z');
  const git = activity('git', 0, 6);

  it('leaves the finished ones to the history', () => {
    expect(activitiesToDo([linux])).toEqual([]);
  });

  it('puts the most recently entered first, then those never opened in their order', () => {
    expect(activitiesToDo([snake, pacman, linux, docker, git])).toEqual([
      docker,
      pacman,
      snake,
      git,
    ]);
  });
});
