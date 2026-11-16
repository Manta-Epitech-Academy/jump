import { describe, it, expect } from 'vitest';
import {
  isInvitationOpen,
  pickHomeHero,
  type TalentHomeHighlight,
} from './talentHome';
import type { WorkshopActivity } from './workshops';

// An event's first day as the sync stores it: midnight on the campus clock.
const startsOn = (instant: string) => ({ date: new Date(instant) });

describe('isInvitationOpen', () => {
  // 14 October at 00:00 in Paris (CEST, UTC+2).
  const event = startsOn('2026-10-13T22:00:00Z');

  it('invites until the end of the first day, and stops the next', () => {
    // 23:30 in Paris on 14 October.
    expect(
      isInvitationOpen(event, 'Europe/Paris', new Date('2026-10-14T21:30:00Z')),
    ).toBe(true);
    // 00:30 in Paris on 15 October: the event is under way.
    expect(
      isInvitationOpen(event, 'Europe/Paris', new Date('2026-10-14T22:30:00Z')),
    ).toBe(false);
  });

  it('invites to an event still to come', () => {
    expect(
      isInvitationOpen(event, 'Europe/Paris', new Date('2026-10-01T08:00:00Z')),
    ).toBe(true);
  });

  it('reads the day on the campus clock, not on the server’s', () => {
    // 14 October at 00:00 in La Réunion (UTC+4).
    const reunion = startsOn('2026-10-13T20:00:00Z');
    // 20:30 UTC on 14 October is already 15 October in La Réunion.
    expect(
      isInvitationOpen(
        reunion,
        'Indian/Reunion',
        new Date('2026-10-14T20:30:00Z'),
      ),
    ).toBe(false);
    expect(
      isInvitationOpen(
        reunion,
        'Indian/Reunion',
        new Date('2026-10-14T19:30:00Z'),
      ),
    ).toBe(true);
  });
});

describe('pickHomeHero', () => {
  const activity = (
    slug: string,
    progress: { solved: number; total: number; startedAt: string | null },
  ): WorkshopActivity => ({
    slug,
    label: slug,
    solvedSteps: progress.solved,
    totalSteps: progress.total,
    startedAt: progress.startedAt ? new Date(progress.startedAt) : null,
    cover: { tagline: null, media: null, poster: null, mascot: null },
  });
  const invitation = {
    title: 'Les Ateliers TECH',
    text: 'Toute l’année, des ateliers gratuits : inscris-toi !',
    url: 'https://www.epitech.invalid/agenda',
    buttonLabel: null,
    image: null,
  };
  const highlight: TalentHomeHighlight = { event: null, invitation };
  const pacman = activity('pacman', {
    solved: 3,
    total: 10,
    startedAt: '2026-10-01T10:00:00Z',
  });
  const santa = activity('santa', {
    solved: 1,
    total: 30,
    startedAt: '2026-10-03T10:00:00Z',
  });
  const linux = activity('linux', {
    solved: 12,
    total: 12,
    startedAt: '2026-10-04T10:00:00Z',
  });
  const untouched = activity('snake', { solved: 0, total: 0, startedAt: null });

  it('leaves the day’s activity alone in the hero, highlight or not', () => {
    expect(
      pickHomeHero({ today: [pacman], highlight, activities: [santa] }),
    ).toEqual({ kind: 'activity', activities: [pacman] });
  });

  it('leads with the campus’s invitation on a day without an activity', () => {
    expect(
      pickHomeHero({ today: [], highlight, activities: [pacman] }),
    ).toEqual({ kind: 'highlight', invitation });
  });

  it('suggests carrying on the most recently started unfinished activity', () => {
    expect(
      pickHomeHero({
        today: [],
        highlight: null,
        activities: [pacman, linux, untouched, santa],
      }),
    ).toEqual({ kind: 'continue', activity: santa });
  });

  it('suggests nothing rather than filling the hero', () => {
    expect(
      pickHomeHero({
        today: [],
        highlight: null,
        activities: [linux, untouched],
      }),
    ).toBeNull();
  });
});
