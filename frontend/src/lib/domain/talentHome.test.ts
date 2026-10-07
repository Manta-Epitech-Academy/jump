import { describe, it, expect } from 'vitest';
import {
  activitiesLeftToDo,
  formatHighlightDay,
  isHighlightOpen,
  pickHomeHero,
  type TalentHomeHighlight,
} from './talentHome';
import type { WorkshopActivity } from './workshops';

const day = (key: string) => new Date(`${key}T00:00:00.000Z`);

describe('isHighlightOpen', () => {
  it('stays open all of its own day, and closes the next', () => {
    // 23:30 in Paris on 7 October (CEST, UTC+2).
    expect(
      isHighlightOpen(
        day('2026-10-07'),
        'Europe/Paris',
        new Date('2026-10-07T21:30:00Z'),
      ),
    ).toBe(true);
    // 00:30 in Paris on 8 October.
    expect(
      isHighlightOpen(
        day('2026-10-07'),
        'Europe/Paris',
        new Date('2026-10-07T22:30:00Z'),
      ),
    ).toBe(false);
  });

  it('reads the day on the campus clock, not on the server’s', () => {
    // 20:30 UTC on 7 October is already 8 October in La Réunion (UTC+4).
    const now = new Date('2026-10-07T20:30:00Z');
    expect(isHighlightOpen(day('2026-10-07'), 'Indian/Reunion', now)).toBe(
      false,
    );
    expect(isHighlightOpen(day('2026-10-07'), 'Europe/Paris', now)).toBe(true);
  });
});

describe('formatHighlightDay', () => {
  it('names the day itself, whatever the reader’s timezone', () => {
    expect(formatHighlightDay('2026-10-07')).toBe('mercredi 7 octobre');
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
  const highlight: TalentHomeHighlight = {
    title: 'Recode le jeu Snake en JS',
    summary: 'Deux heures pour coder ton propre Snake.',
    date: '2026-10-14',
    url: 'https://www.epitech.invalid/inscription',
    image: null,
  };
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

  it('leads with the day’s activity, the highlight as what comes after', () => {
    expect(
      pickHomeHero({ today: [pacman], highlight, activities: [santa] }),
    ).toEqual({ kind: 'activity', activities: [pacman], next: highlight });
    expect(
      pickHomeHero({ today: [pacman], highlight: null, activities: [] }),
    ).toEqual({ kind: 'activity', activities: [pacman], next: null });
  });

  it('leads with the campus’s highlight on a day without an activity', () => {
    expect(
      pickHomeHero({ today: [], highlight, activities: [pacman] }),
    ).toEqual({ kind: 'highlight', highlight });
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

describe('activitiesLeftToDo', () => {
  const activity = (
    slug: string,
    solved: number,
    total: number,
  ): WorkshopActivity => ({
    slug,
    label: slug,
    solvedSteps: solved,
    totalSteps: total,
    startedAt: solved > 0 ? new Date('2026-10-01T10:00:00Z') : null,
    cover: { tagline: null, media: null, poster: null, mascot: null },
  });
  const pacman = activity('pacman', 3, 10);
  const linux = activity('linux', 12, 12);
  const snake = activity('snake', 0, 0);

  it('keeps what is not finished, and never the activity the hero suggests', () => {
    expect(
      activitiesLeftToDo([pacman, linux, snake], {
        kind: 'continue',
        activity: pacman,
      }),
    ).toEqual([snake]);
  });

  it('keeps every unfinished activity when the hero suggests something else', () => {
    expect(activitiesLeftToDo([pacman, linux, snake], null)).toEqual([
      pacman,
      snake,
    ]);
  });
});
