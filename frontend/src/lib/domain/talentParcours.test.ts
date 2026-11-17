import { describe, it, expect } from 'vitest';
import {
  buildParcours,
  parcoursDaysLabel,
  type ParcoursEventFacts,
} from './talentParcours';
import { UNNAMED_EVENT_NAME } from './event';
import type { WorkshopActivity } from './workshops';

// Wednesday 18 November 2026, 10:00 in Paris.
const NOW = new Date('2026-11-18T09:00:00Z');

const event = (
  id: string,
  date: string,
  over: Partial<ParcoursEventFacts> = {},
): ParcoursEventFacts => ({
  id,
  publicName: `Event ${id}`,
  date,
  endDate: null,
  startMinutes: null,
  timezone: 'Europe/Paris',
  category: null,
  ...over,
});

const activity = (
  slug: string,
  eventId: string,
  over: Partial<WorkshopActivity> = {},
): WorkshopActivity => ({
  slug,
  eventId,
  slot: null,
  label: slug,
  solvedSteps: 0,
  totalSteps: 4,
  startedAt: null,
  cover: { tagline: null, media: null, poster: null, mascot: null },
  ...over,
});

const mapOf = (...events: ParcoursEventFacts[]) =>
  new Map(events.map((e) => [e.id, e]));

describe('parcoursDaysLabel', () => {
  it('writes one day, a run within a month, across months and across years', () => {
    expect(parcoursDaysLabel('2026-04-04', null)).toBe('04/04/26');
    expect(parcoursDaysLabel('2026-06-15', '2026-06-26')).toBe('15-26/06/26');
    expect(parcoursDaysLabel('2026-06-30', '2026-07-02')).toBe(
      '30/06-02/07/26',
    );
    expect(parcoursDaysLabel('2026-12-29', '2027-01-02')).toBe(
      '29/12/26-02/01/27',
    );
  });
});

describe('buildParcours', () => {
  it('lists the events the talent came to newest first, each with its activity XP', () => {
    const parcours = buildParcours({
      now: NOW,
      events: mapOf(
        event('march', '2026-03-14'),
        event('june', '2026-06-15', { endDate: '2026-06-26' }),
      ),
      attended: ['march', 'june'],
      enrolled: [],
      earned: [
        { eventId: 'june', slug: 'snake', label: 'Snake.js', xp: 900 },
        { eventId: 'june', slug: 'osint', label: 'CTF OSINT', xp: 1000 },
      ],
      offered: [],
    });
    expect(parcours.ahead).toEqual([]);
    expect(parcours.past.map((e) => [e.id, e.days])).toEqual([
      ['june', '15-26/06/26'],
      ['march', '14/03/26'],
    ]);
    expect(parcours.past[0].activities).toEqual([
      { slug: 'snake', label: 'Snake.js', xp: 900, action: null },
      { slug: 'osint', label: 'CTF OSINT', xp: 1000, action: null },
    ]);
  });

  it('draws an event the talent only earned XP at, without claiming they came', () => {
    const parcours = buildParcours({
      now: NOW,
      events: mapOf(event('club', '2026-10-07')),
      attended: [],
      enrolled: [],
      earned: [{ eventId: 'club', slug: 'pong', label: 'PyPong', xp: 60 }],
      offered: [],
    });
    expect(parcours.past.map((e) => e.id)).toEqual(['club']);
  });

  it('shows an activity once: under its XP while unfinished, never again as to do', () => {
    const parcours = buildParcours({
      now: NOW,
      events: mapOf(event('camp', '2026-10-20'), event('club', '2026-10-28')),
      attended: ['camp', 'club'],
      enrolled: [],
      earned: [{ eventId: 'camp', slug: 'pacman', label: 'Pacman', xp: 200 }],
      offered: [
        // Offered again through a later event, the walk stays where it began.
        activity('pacman', 'club', {
          label: 'Pacman IA',
          solvedSteps: 2,
          startedAt: NOW,
        }),
        activity('robob', 'club'),
        activity('done', 'club', { solvedSteps: 4, startedAt: NOW }),
      ],
    });
    const [club, camp] = parcours.past;
    expect(camp.activities).toEqual([
      { slug: 'pacman', label: 'Pacman IA', xp: 200, action: 'continue' },
    ]);
    expect(club.activities).toEqual([
      { slug: 'robob', label: 'robob', xp: null, action: 'start' },
    ]);
  });

  it('puts the running event first, then what comes next, soonest first', () => {
    const parcours = buildParcours({
      now: NOW,
      events: mapOf(
        event('later', '2026-12-12'),
        event('soon', '2026-11-25'),
        event('stage', '2026-11-16', { endDate: '2026-11-20' }),
        event('before', '2026-10-01'),
      ),
      attended: ['before'],
      enrolled: ['later', 'soon', 'stage'],
      earned: [],
      offered: [],
    });
    expect(parcours.ahead.map((e) => [e.id, e.phase])).toEqual([
      ['stage', 'live'],
      ['soon', 'upcoming'],
      ['later', 'upcoming'],
    ]);
    expect(parcours.past.map((e) => e.id)).toEqual(['before']);
  });

  it('carries the category colour and the key-event mark, and names an unnamed event', () => {
    const parcours = buildParcours({
      now: NOW,
      events: mapOf(
        event('stage', '2026-06-15', {
          category: { color: '#ff1ef7', keyEvent: true },
        }),
        event('bare', '2026-05-02', { publicName: null }),
      ),
      attended: ['stage', 'bare'],
      enrolled: [],
      earned: [],
      offered: [],
    });
    expect(parcours.past[0]).toMatchObject({
      color: '#ff1ef7',
      keyEvent: true,
    });
    expect(parcours.past[1]).toMatchObject({
      name: UNNAMED_EVENT_NAME,
      color: null,
      keyEvent: false,
    });
  });

  it('draws nothing for an event it was not handed', () => {
    const parcours = buildParcours({
      now: NOW,
      events: mapOf(),
      attended: ['ghost'],
      enrolled: [],
      earned: [{ eventId: 'ghost', slug: 'x', label: 'X', xp: 10 }],
      offered: [activity('y', 'ghost')],
    });
    expect(parcours).toEqual({ ahead: [], past: [] });
  });
});
